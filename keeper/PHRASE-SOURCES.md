# Phrase Lab dictionary sources

The bundled pool contains **555,203 distinct normalized single-word tokens** and
**29,738 recorded multiword expressions of two to eight words**. It combines
three complete downloaded sources described below. It is not every meaningful
English phrase and is not claimed to be the largest dictionary in existence.

| Input | Selection and source | Normalized result before union |
| --- | --- | ---: |
| English Speller Database | [Official ESDB source, commit 1e5b7d3a72f47a71da5d28686c1dd4b397178485](https://github.com/en-wl/wordlist/tree/1e5b7d3a72f47a71da5d28686c1dd4b397178485), size 85, spelling codes A/B/Z/C/D, variant level 9, no word filter | 316,801 single words; 26,479 compounds |
| dwyl English words | [Full words.txt](https://github.com/dwyl/english-words/blob/master/words.txt), retrieved 2026-11-17; 466,550 input lines | 463,220 single words |
| English Wiktionary phrase entries | [Kaikki English phrase export](https://kaikki.org/dictionary/English/pos-phrase/index.html), English Wiktionary dump 2026-10-01, extracted 2026-10-30; 5,296 structured JSONL records | 3,362 multiword expressions |

Duplicates shared between sources are merged. Each JSON index records source
URLs, normalized content identities, raw input digests and exact counts. The
complete ESDB copyright and permission notice and dwyl Unlicense notice appear
below and are also embedded in both JSON indexes. ESDB copyright applies to its
single words and open compounds. The Wiktionary phrase selection is attributed
to **English Wiktionary contributors** and **Tatu Ylonen / Wiktextract via
kaikki.org**, under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
Read the [complete legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en)
and [Wiktionary copyright information](https://en.wiktionary.org/wiki/Wiktionary:Copyrights).
Application code remains separately licensed under GPL-3.0-only. These notices
do not change the license of the user's own writing.

The larger full Kaikki English dictionary was located, but repeated transfer
interruptions prevented a complete capture during this build. It is not
included or counted as a bundled 1.4 million entry pool. No partial download was
labeled a complete dictionary.

## What was changed

The builder is included in the full repository/Home Assistant source archive;
desktop and Pi users should download that source archive to reproduce the data.
From its repository root, `scripts/build-phrase-dictionary.py` reads the complete supplied word lists and
Wiktextract phrase JSONL. It retains records with supported words, lowercases and
normalizes Unicode text, standardizes internal apostrophes and hyphens,
collapses spaces and merges duplicate normalized forms. Tokens contain Unicode
letters and combining marks, with internal apostrophes or hyphens. Multiword
entries are limited to eight words. Punctuation-only records, numerals,
unsupported symbols and affix fragments are excluded. Definitions, quotations,
examples, audio, images, etymologies and user material are not included.

The word pool includes rare words, names, historical forms, inflections and
specialized terminology present in its sources. A single-word match means
**word-list evidence**. A multiword match means a recorded dictionary or word-list
expression, not proof of truth, suitability, original authorship or a statement
made by the user. Every multiword record retains source links and its source
kind and license. Automatic acceptance uses this exact evidence; meaningful
combinations absent from the supplied indexes will not be automatically accepted.

## Friendly mode

Friendly flags combine Wiktionary's vulgar, offensive, derogatory, slur,
racist, sexist, homophobic, transphobic, obscene, profanity, pejorative and
explicit-sex labels across senses. The ESDB supplement selects usage notes
`no-default`, `vulgar-1`, `vulgar-2`, `vulgar-3`, `offensive-1`, `offensive-2`,
and `offensive-3`. A conservative manual supplement covers ten common explicit
words: `fuck`, `shit`, `cunt`, `motherfucker`, `asshole`, `bitch`, `cock`, `pussy`,
`dick`, and `bastard`. The combined blocked-term list has 219 normalized entries.
Flagged complete word parts in a longer headword also flag that headword.

Source labels and this small filter can miss objectionable content and can
exclude innocent senses of ambiguous words. Friendly mode is a convenience
filter, not a complete content classifier. The dictionary identity includes
both its word pool and Friendly flags so changed flags select a new checkpoint.

## Rebuilding

Generate ESDB's official word list from the pinned source revision using its
`word-list` command, size 85, spellings A/B/Z/C/D, variant level 9 and
`--no-word-filter`. Generate its separate usage-note list with the values above.
Download dwyl's full `words.txt` and its `LICENSE.md`, plus the linked Kaikki phrase
JSONL. From the Keeper repository root run the builder with repeated sources:

```sh
python scripts/build-phrase-dictionary.py \
  --input /data/english-phrases.jsonl \
  --source-url https://kaikki.org/dictionary/English/pos-phrase/kaikki.org-dictionary-English-by-pos-phrase.jsonl \
  --word-list /data/esdb-85-all-words.txt \
  --word-source https://github.com/en-wl/wordlist/tree/1e5b7d3a72f47a71da5d28686c1dd4b397178485 \
  --word-license https://github.com/en-wl/wordlist/blob/1e5b7d3a72f47a71da5d28686c1dd4b397178485/Copyright \
  --word-notice /data/ESDB-Copyright \
  --word-list /data/dwyl-words.txt \
  --word-source https://github.com/dwyl/english-words \
  --word-license Unlicense --word-notice /data/dwyl-LICENSE.md \
  --word-label "ESDB85 all spellings + dwyl English words: normalized union" \
  --flagged-list /data/esdb-85-flagged-words.txt
```

The script writes `keeper/public/phrase-dictionary.json` and
`keeper/public/phrase-attestations.json`. It also supports streaming the full
English-only JSONL export (including HTTP gzip), or reading a local `.jsonl.gz`.
Different source versions can change the content identities and counts. The
bundle's metadata is the reference for its exact corpus; the example paths are
build inputs, not user storage locations.

## ESDB complete copyright and permission notice

The following notice is reproduced in full from the pinned source's`Copyright`.
It covers all selected spelling regions, including Australian English, and the
selected size above80.

```text
Copyright 2000-2026 by Kevin Atkinson

Permission to use, copy, modify, distribute, and sell any part of the English
Speller Database (ESDB, previously known as SCOWLv2), or word lists
created from it, is hereby granted without fee, provided that the above
copyright notice appears in all copies and that both the above copyright
notice and this notice appear in supporting documentation.  Kevin Atkinson
makes no representations about the suitability of this database for any
purpose.  It is provided "as is" without express or implied warranty.

ESDB is derived from many sources, most of which are in the Public Domain.
Data from the Corpus of Contemporary American English (COCA) was also used.

All data from COCA comes from 3-gram data that is not freely available;
however, the usage is within the rights given by the NDA that was signed when
purchasing the data.  More information on COCA is available at
https://www.english-corpora.org/coca/.

The primary source of words for ESDB comes from 12dicts and ENABLE2K.  Both
are in the Public Domain, but Alan Beale <biljir@pobox.com> deserves special
credit as he is the author of 12dicts and a major contributor to ENABLE2K.  In
addition, he gave me an incredible amount of feedback and created a number of
special lists in order to help improve the overall quality of ESDB.

===

If you are using an official speller dictionary created by ESDB that is not
Australian English, then no additional copyright applies and including the
notice before the === is sufficient.

If you are using the Australian English dictionary or a wordlist that uses the 'D'
SPELLING code and/or the 'AU' REGION code, the copyright after '=== AU' applies.

If you are using a generated word list larger than 80, the copyright
after '=== UKACD' applies.

If you are distributing the database or results from the 
database that is not a speller dictionary or generated word list, then both
copyrights may apply depending on the parts you use.  In addition, the WordNet
copyright MIGHT apply as WordNet was one of many sources used for the initial
POS assignment.

=== AU

The initial information for Australian English comes from Benjamin Titze:

  Copyright 2016 by Benjamin Titze

  Permission to use, copy, modify, distribute and sell this array, the
  associated software, and its documentation for any purpose is hereby
  granted without fee, provided that the above copyright notice appears
  in all copies and that both that copyright notice and this permission
  notice appear in supporting documentation. Benjamin Titze makes no
  representations about the suitability of this array for any
  purpose. It is provided "as is" without express or implied warranty.

=== UKACD

Some words used come from the UK Advanced Cryptics Dictionary:

  Copyright (c) J Ross Beresford 1993-1999. All Rights Reserved.

  The following restriction is placed on the use of this publication:
  if The UK Advanced Cryptics Dictionary is used in a software package
  or redistributed in any form, the copyright notice must be
  prominently displayed and the text of this document must be included
  verbatim.

  There are no other restrictions: I would like to see the list
  distributed as widely as possible.

=== WordNet

WordNet was used to help with the initial POS assignment:

  This software and database is being provided to you, the LICENSEE,
  by Princeton University under the following license.  By obtaining,
  using and/or copying this software and database, you agree that you
  have read, understood, and will comply with these terms and
  conditions.:

  Permission to use, copy, modify and distribute this software and
  database and its documentation for any purpose and without fee or
  royalty is hereby granted, provided that you agree to comply with
  the following copyright notice and statements, including the
  disclaimer, and that the same appear on ALL copies of the software,
  database and documentation, including modifications that you make
  for internal use or for distribution.

  WordNet 1.6 Copyright 1997 by Princeton University.  All rights
  reserved.

  THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON
  UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR
  IMPLIED.  BY WAY OF EXAMPLE, BUT NOT LIMITATION, PRINCETON
  UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES OF MERCHANT-
  ABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE
  LICENSED SOFTWARE, DATABASE OR DOCUMENTATION WILL NOT INFRINGE ANY
  THIRD PARTY PATENTS, COPYRIGHTS, TRADEMARKS OR OTHER RIGHTS.

  The name of Princeton University or Princeton may not be used in
  advertising or publicity pertaining to distribution of the software
  and/or database.  Title to copyright in this software, database and
  any associated documentation shall at all times remain with
  Princeton University and LICENSEE agrees to preserve same.
```

## dwyl complete Unlicense notice

```text
This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <https://unlicense.org/>
```
