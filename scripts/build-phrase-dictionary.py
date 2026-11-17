#!/usr/bin/env python3
"""Build deterministic, definition-free Phrase Lab indexes from Wiktextract JSONL.

The English-only Kaikki export is streamed (including HTTP gzip encoding). No
private Keeper data is used. Run --help for local-file and download options.
"""
from __future__ import annotations

import argparse
import contextlib
import gzip
import hashlib
import io
import json
import re
import ssl
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

SOURCE = "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl"
INDEX = "https://kaikki.org/dictionary/English/index.html"
BLOCKED_TAGS = {"vulgar", "offensive", "derogatory", "slur", "ethnic-slur", "racial-slur", "racist", "sexist", "homophobic", "transphobic", "taboo", "sexual", "explicit", "obscene", "profane", "profanity", "sexually-explicit", "pejorative"}
MANUAL_BLOCKED_WORDS = {"fuck", "shit", "cunt", "motherfucker", "asshole", "bitch", "cock", "pussy", "dick", "bastard"}
TRANSLATE = str.maketrans({"\u2018": "'", "\u2019": "'", "\u02bc": "'", "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2212": "-"})


def normalize(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).translate(TRANSLATE).lower().split())


def valid_token(token: str) -> bool:
    parts = re.split("[-']", token)
    return bool(parts) and all(part and unicodedata.category(part[0]).startswith("L") and all(unicodedata.category(ch)[0] in "LM" for ch in part) for part in parts)


def accepted(value: str) -> bool:
    return 0 < len(value) <= 256 and 1 <= len(value.split()) <= 8 and all(valid_token(part) for part in value.split())


def json_bytes(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def digest(value) -> str:
    return hashlib.sha256(json_bytes(value)).hexdigest()


@contextlib.contextmanager
def input_stream(path: str | None, source: str):
    if path:
        opener = gzip.open if path.endswith(".gz") else open
        with opener(path, "rt", encoding="utf-8") as stream:
            yield stream, {"input": Path(path).name}
        return
    # SSLContext keeps normal certificate validation while avoiding platform
    # SSLKEYLOGFILE hooks that may be inaccessible in a restricted build host.
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.load_default_certs()
    request = urllib.request.Request(source, headers={"User-Agent": "DoodleKeeperPhraseDictionary/1.0", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(request, context=context, timeout=120) as response:
        headers = {"lastModified": response.headers.get("Last-Modified"), "etag": response.headers.get("ETag"), "transferBytes": response.headers.get("Content-Length"), "contentEncoding": response.headers.get("Content-Encoding")}
        binary = gzip.GzipFile(fileobj=response) if response.headers.get("Content-Encoding") == "gzip" else response
        with io.TextIOWrapper(binary, encoding="utf-8") as text:
            yield text, headers


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", help="Local Wiktextract JSONL or .gz instead of the public download")
    parser.add_argument("--source-url", default=SOURCE)
    parser.add_argument("--word-list", type=Path, action="append", help="Use these newline-delimited word pools instead of JSONL single-word heads; repeat to take a union")
    parser.add_argument("--word-source", action="append", help="Public source URL for each --word-list, in matching order")
    parser.add_argument("--word-label", default="Filtered English single-word pool")
    parser.add_argument("--word-license", action="append", help="License identifier or notice URL for each --word-list, in matching order")
    parser.add_argument("--word-notice", type=Path, action="append", help="Complete copyright/permission notice for each --word-list, in matching order")
    parser.add_argument("--word-source-date", default="not declared", help="Snapshot date for --word-list; independent of the Wiktionary dump date")
    parser.add_argument("--flagged-list", type=Path, action="append", help="Additional source-labeled vulgar/offensive word forms, one per line")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parents[1] / "keeper" / "public")
    parser.add_argument("--source-date", default="2026-10-01", help="Source Wiktionary dump date, taken from the source index")
    parser.add_argument("--extracted-date", default="2026-10-30", help="Kaikki extraction date, taken from the source index")
    args = parser.parse_args()
    if args.word_list and not (args.word_source and args.word_license and len(args.word_list) == len(args.word_source) == len(args.word_license)):
        parser.error("Each --word-list requires a matching --word-source and --word-license")
    if args.word_notice and len(args.word_notice) != len(args.word_list or []):
        parser.error("Provide one --word-notice per --word-list")
    words: set[str] = set()
    blocked_words: set[str] = set(MANUAL_BLOCKED_WORDS)
    multi: dict[str, dict] = {}
    raw_lines = 0
    english_lines = 0
    raw_hash = hashlib.sha256()
    started = time.monotonic()
    with input_stream(args.input, args.source_url) as (stream, transfer):
        print(json.dumps({"state": "reading", "transfer": transfer}), flush=True)
        for line in stream:
            raw_hash.update(line.encode("utf-8"))
            raw_lines += 1
            entry = json.loads(line)
            if entry.get("lang_code") != "en" and entry.get("lang") != "English":
                continue
            english_lines += 1
            original = entry.get("word", "")
            if not isinstance(original, str):
                continue
            text = normalize(original)
            if not accepted(text):
                continue
            senses = entry.get("senses", [])
            # A structured English sense is attestation, not universal semantic
            # judgment. Entries explicitly lacking a gloss are excluded.
            if not any(s.get("glosses") or s.get("raw_glosses") or s.get("form_of") or s.get("alt_of") for s in senses):
                continue
            tags = set(entry.get("tags", []))
            for sense in senses:
                tags.update(sense.get("tags", []))
            flagged = bool(tags & BLOCKED_TAGS)
            if " " not in text:
                words.add(text)
                if flagged:
                    blocked_words.add(text)
            else:
                item = multi.setdefault(text, {"text": text, "source": "https://en.wiktionary.org/wiki/" + urllib.parse.quote(original.replace(" ", "_"), safe="_'-"), "sourceKind": "wiktionary-headword", "license": "CC-BY-SA-4.0", "tags": set(), "blocked": False})
                item["tags"].update(tags & BLOCKED_TAGS)
                item["blocked"] |= flagged
            if raw_lines % 100000 == 0:
                print(json.dumps({"state": "reading", "records": raw_lines, "words": len(words), "phrases": len(multi), "seconds": round(time.monotonic() - started, 1)}), flush=True)
    for flagged_path in args.flagged_list or []:
        blocked_words.update(text for line in flagged_path.read_text(encoding="utf-8-sig").splitlines() if (text := normalize(line)) and accepted(text))
    word_meta = {}
    if args.word_list:
        words = set()
        origins = []
        for position, (word_path, word_source, word_license) in enumerate(zip(args.word_list, args.word_source, args.word_license)):
            word_bytes = word_path.read_bytes()
            word_lines = word_bytes.decode("utf-8-sig").splitlines()
            local_words = {text for line in word_lines if (text := normalize(line)) and " " not in text and accepted(text)}
            words.update(local_words)
            local_multi = {text for line in word_lines if " " in (text := normalize(line)) and accepted(text)}
            for text in local_multi:
                if text in multi:
                    item = multi[text]
                    item.setdefault("sources", []).append(word_source)
                    item.setdefault("additionalLicenses", []).append(word_license)
                else:
                    multi[text] = {"text": text, "source": word_source, "sourceKind": "word-list-compound", "license": word_license, "tags": set(), "blocked": False}
            notice = args.word_notice[position].read_text(encoding="utf-8-sig") if args.word_notice else "See source permission notice."
            origins.append({"source": word_source, "license": word_license, "copyrightNotice": notice, "rawSha256": hashlib.sha256(word_bytes).hexdigest(), "inputCount": len(word_lines), "normalizedCount": len(local_words), "compoundCount": len(local_multi)})
        first_source, first_license = args.word_source[0], args.word_license[0]
        word_meta = {"source": first_source, "sourceData": first_source, "sources": origins, "sourceDate": args.word_source_date, "extractedDate": "normalized by this builder", "license": "; ".join(args.word_license), "licenseUrl": first_license if first_license.startswith("https://") else ("https://unlicense.org/" if first_license == "Unlicense" else first_source), "label": args.word_label, "attribution": "Word pool: source maintainers listed in sources; complete notices accompany PHRASE-SOURCES.md. Phrase attestations: English Wiktionary contributors; Tatu Ylonen / Wiktextract via kaikki.org.", "rawSha256": digest(origins), "sourceRecords": sum(item["inputCount"] for item in origins), "englishRecords": None, "attestationSource": INDEX, "attestationSourceData": args.source_url, "attestationSourceDate": args.source_date, "attestationExtractedDate": args.extracted_date, "attestationRawSha256": raw_hash.hexdigest(), "friendlyLabelsCoverage": "Labels from the supplied attestation JSONL plus the manual Friendly supplement; single-word sources have no guaranteed complete content labels."}
    # Friendly mode also catches flagged headwords embedded in longer phrases.
    # Each compound's direct source tags remain attached independently.
    blocked_parts = {word for word in blocked_words if len(word) > 2 and " " not in word}
    for text, item in multi.items():
        if text in blocked_words or any(part in blocked_parts for part in re.split(r"[\s'-]+", text)):
            item["blocked"] = True
            item["tags"].add("flagged-word")
        item["tags"] = sorted(item["tags"])
        if "sources" in item:
            item["sources"] = sorted(set(item["sources"]))
            item["additionalLicenses"] = sorted(set(item["additionalLicenses"]))
    ordered_words = sorted(words)
    ordered_phrases = [multi[text] for text in sorted(multi)]
    common = {"source": INDEX, "sourceData": args.source_url, "sourceDate": args.source_date, "extractedDate": args.extracted_date, "license": "CC-BY-SA-4.0", "attribution": "English Wiktionary contributors; extracted by Tatu Ylonen and Wiktextract via kaikki.org", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/", "rawSha256": raw_hash.hexdigest(), "sourceRecords": raw_lines, "englishRecords": english_lines, "transfer": transfer}
    dictionary = {"format": "doodlekeeper-phrase-dictionary-v1", "id": digest({"words": ordered_words, "friendlyBlockedWords": sorted(blocked_words)}), "label": "Kaikki / English Wiktionary: filtered single-word headwords", "words": ordered_words, "count": len(ordered_words), "friendlyBlockedWords": sorted(blocked_words), "manualFriendlySupplement": sorted(MANUAL_BLOCKED_WORDS), **common, **word_meta}
    attestation_meta = {"label": "English dictionary and word-list multiword entries, up to eight words", "additionalSources": word_meta.get("sources", []), "license": "CC-BY-SA-4.0 selection; each entry retains its source's license and notices"} if args.word_list else {}
    attestations = {"format": "doodlekeeper-phrase-attestations-v1", "id": digest(ordered_phrases), "label": "Kaikki / English Wiktionary: attested multiword headwords, up to eight words", "entries": ordered_phrases, "count": len(ordered_phrases), **common, **attestation_meta}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for name, value in (("phrase-dictionary.json", dictionary), ("phrase-attestations.json", attestations)):
        destination = args.output_dir / name
        destination.write_bytes(json_bytes(value) + b"\n")
        print(json.dumps({"state": "written", "file": name, "count": value["count"], "id": value["id"], "bytes": destination.stat().st_size}), flush=True)
    print(json.dumps({"state": "complete", "records": raw_lines, "seconds": round(time.monotonic() - started, 1)}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
