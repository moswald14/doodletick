// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.38;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Independent experimental garden. No bridge, admin mint, upgrade, or cash redemption.
/// Recipe fingerprints are first registrations, not proof of authorship or unique people.
contract DoodleGarden is ERC20 {
    uint256 public constant MAX_SUPPLY = 1_000_000;
    uint256 public constant HOURLY_POOL = 900_000;
    uint256 public constant MINING_POOL = 100_000;
    uint256 public constant MAX_GENERATORS = 4096;
    uint256 public constant MAX_PER_ACCOUNT = 32;
    uint256 public constant MAX_CLAIM_HOURS = 720;
    uint256 public constant MAX_PROOFS_PER_HOUR = 64;
    uint256 public constant POW_BITS = 16;
    bytes32 public constant PROOF_DOMAIN = sha256("doodletick-public-garden-pow-v1");

    struct Generator { address owner; uint256 paidThrough; uint256 proofCounter; uint256 minedHourPlusOne; }
    struct Reservation { bytes32 commitment; uint256 blockNumber; uint256 expiresAt; }
    mapping(bytes32 => Generator) public generators;
    mapping(address => Reservation) public reservations;
    mapping(address => bytes32[]) private _recipes;
    mapping(uint256 => uint256) public hourlyProofs;
    uint256 public generatorCount;
    uint256 public hourlyMinted;
    uint256 public miningMinted;

    error InvalidRecipe();
    error ReservationRequired();
    error RegistrationLimit();
    error NotGeneratorOwner();
    error NoReward();
    error StaleProof();
    error InvalidProof();
    error SupplyLimit();
    event Reserved(address indexed owner, bytes32 commitment, uint256 expiresAt);
    event Registered(bytes32 indexed recipe, address indexed owner, uint256 paidThrough);
    event Harvested(bytes32 indexed recipe, address indexed owner, uint256 amount, uint256 paidThrough);
    event Mined(bytes32 indexed recipe, address indexed owner, uint256 hour, uint256 counter);

    constructor() ERC20("Doodle Garden Token", "DGT") {}
    function decimals() public pure override returns (uint8) { return 0; }
    function gardenVersion() external pure returns (uint256) { return 1; }
    function currentHour() public view returns (uint256) { return block.timestamp / 1 hours; }
    function recipesOf(address owner) external view returns (bytes32[] memory) { return _recipes[owner]; }

    function registrationCommitment(bytes32 recipe, address owner) public view returns (bytes32) {
        return sha256(abi.encode(address(this), block.chainid, owner, recipe));
    }

    /// @dev A later-block reveal prevents copying a pending reveal to steal a new fingerprint.
    function reserve(bytes32 commitment) external {
        if (commitment == bytes32(0)) revert InvalidRecipe();
        reservations[msg.sender] = Reservation(commitment, block.number, block.timestamp + 1 days);
        emit Reserved(msg.sender, commitment, block.timestamp + 1 days);
    }

    function register(bytes32 recipe) external {
        if (recipe == bytes32(0) || generators[recipe].owner != address(0)) revert InvalidRecipe();
        Reservation memory r = reservations[msg.sender];
        if (r.commitment != registrationCommitment(recipe, msg.sender) || block.number <= r.blockNumber || block.timestamp > r.expiresAt) revert ReservationRequired();
        if (generatorCount >= MAX_GENERATORS || _recipes[msg.sender].length >= MAX_PER_ACCOUNT) revert RegistrationLimit();
        delete reservations[msg.sender];
        uint256 startHour = currentHour() + (block.timestamp % 1 hours == 0 ? 0 : 1);
        generators[recipe] = Generator(msg.sender, startHour, 0, 0);
        _recipes[msg.sender].push(recipe);
        ++generatorCount;
        emit Registered(recipe, msg.sender, startHour);
    }

    function claimable(bytes32 recipe) public view returns (uint256) {
        Generator storage g = generators[recipe];
        uint256 hour = currentHour();
        if (g.owner == address(0) || hour <= g.paidThrough) return 0;
        uint256 amount = hour - g.paidThrough;
        if (amount > MAX_CLAIM_HOURS) amount = MAX_CLAIM_HOURS;
        uint256 left = HOURLY_POOL - hourlyMinted;
        return amount > left ? left : amount;
    }

    function claim(bytes32 recipe) external {
        Generator storage g = generators[recipe];
        if (g.owner != msg.sender) revert NotGeneratorOwner();
        uint256 amount = claimable(recipe);
        if (amount == 0) revert NoReward();
        g.paidThrough += amount;
        hourlyMinted += amount;
        _mint(msg.sender, amount);
        emit Harvested(recipe, msg.sender, amount, g.paidThrough);
    }

    /// @return challenge ABI-encoded with the proof nonce, then SHA-256 hashed by the miner.
    function miningState(bytes32 recipe) public view returns (bytes32 challenge, uint256 hour, uint256 counter, bool available) {
        Generator storage g = generators[recipe];
        hour = currentHour();
        counter = g.proofCounter;
        challenge = sha256(abi.encode(PROOF_DOMAIN, block.chainid, address(this), msg.sender, recipe, hour, counter));
        available = g.owner == msg.sender && g.minedHourPlusOne != hour + 1 && hourlyProofs[hour] < MAX_PROOFS_PER_HOUR && miningMinted < MINING_POOL;
    }

    function mine(bytes32 recipe, uint256 expectedHour, uint256 expectedCounter, uint256 nonce) external {
        Generator storage g = generators[recipe];
        if (g.owner != msg.sender) revert NotGeneratorOwner();
        (bytes32 challenge, uint256 hour, uint256 counter, bool available) = miningState(recipe);
        if (hour != expectedHour || counter != expectedCounter) revert StaleProof();
        if (!available) revert NoReward();
        if (uint256(sha256(abi.encode(challenge, nonce))) >> (256 - POW_BITS) != 0) revert InvalidProof();
        g.proofCounter = counter + 1;
        g.minedHourPlusOne = hour + 1;
        ++hourlyProofs[hour];
        ++miningMinted;
        _mint(msg.sender, 1);
        emit Mined(recipe, msg.sender, hour, counter);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) && totalSupply() + value > MAX_SUPPLY) revert SupplyLimit();
        super._update(from, to, value);
    }
}
