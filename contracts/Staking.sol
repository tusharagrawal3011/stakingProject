// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title StakingPool
 * @author Tushar / Team
 * @notice Simple BEP-20 staking pool:
 *         - Users stake a BEP-20 token and earn 1% daily (claimable once per 24h).
 *         - Referral: 0.5% of each stake is paid immediately to the stored referrer (if any).
 *         - Users may stake with or without a referrer. Referrer assigned only once.
 * @dev Improvements vs naive implementation:
 *      - Uses Ownable2Step for safer owner transfers.
 *      - Uses immutable token reference and uint48 timestamps to save gas.
 *      - Uses basis-points (BPS) math to avoid fractional precision issues.
 *      - Gas optimizations: storage caching, nested ifs, delete for clearing storage.
 */

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Staking is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 private constant DAILY_ROI_BPS = 100;      // 1.00% = 100 bps
    uint16 private constant REFERRAL_BPS   = 50;      // 0.50% = 50 bps
    uint16 private constant BPS_DENOM       = 10000;  // denominator for bps math
    uint256 private constant CLAIM_INTERVAL = 1 days; // 24 hours

    // Token (immutable)
    IERC20 public immutable stakingToken;

    // User stake info
    struct StakeInfo {
        uint256 amount;   // total staked
        uint48  lastClaim;// last claim timestamp 
    }

    // Storage
    mapping(address => StakeInfo) private _stakes;   // user => stake info
    mapping(address => address)    private _referrers;// user => referrer address

    bool private _paused; // pause flag

    // Events
    event Staked(address indexed user, uint256 amount, address indexed referrer, uint256 referralPaid);
    event Claimed(address indexed user, uint256 reward);
    event Unstaked(address indexed user, uint256 amount);
    event ReferralPaid(address indexed referrer, uint256 amount);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event OwnerWithdraw(address indexed token, uint256 amount, address indexed to);

    // Constructor
    /// @notice Deploy with token and initial owner (owner must accept via Ownable2Step)
    /// @param token_ the BEP-20 token used for staking & rewards
    /// @param initialOwner address to transfer ownership to (must not be zero)
    constructor(address token_, address initialOwner) payable Ownable(initialOwner) {
        require(token_ != address(0), "token zero");
        require(initialOwner != address(0), "owner zero");
        stakingToken = IERC20(token_);
        _transferOwnership(initialOwner);
    }

    // Public stake entry points

    /// @notice Stake tokens without specifying referrer
    /// @param amount amount to stake (must be >0)
    function stake(uint256 amount) external nonReentrant {
        _stake(amount, address(0));
    }

    /// @notice Stake tokens and optionally provide a referrer
    /// @param amount amount to stake (must be >0)
    /// @param referrer referrer's address (optional)
    function stake(uint256 amount, address referrer) external nonReentrant {
        _stake(amount, referrer);
    }

    // Internal staking logic
    function _stake(uint256 amount, address referrer) internal {
        // Cache frequently used values
        address self = address(this);
        address sender = msg.sender;

        // Pause check (avoid re-store if already paused)
        require(!_paused, "paused");

        // Use the requested require style
        require(amount > 0 , "Amount should be greater than 0");

        // Cache storage pointer once
        StakeInfo storage s = _stakes[sender];

        // Assign referrer only if none is set AND provided referrer is valid & not self
        if (_referrers[sender] == address(0)) {
            if (referrer != address(0)) {
                if (referrer != sender) {
                    _referrers[sender] = referrer;
                }
            }
        }

        // Transfer tokens to contract (uses SafeERC20)
        stakingToken.safeTransferFrom(sender, self, amount);

        // Immediate referral pay-out: 0.5% of the deposited amount, every time user stakes
        address actualRef = _referrers[sender];
        uint256 referralPaid = 0;
        if (actualRef != address(0)) {
            // compute referral: amount * REFERRAL_BPS / BPS_DENOM
            unchecked {
                referralPaid = (amount * REFERRAL_BPS) / BPS_DENOM;
            }
            if (referralPaid != 0) {
                uint256 poolBal = stakingToken.balanceOf(self);
                if (poolBal >= referralPaid) {
                    stakingToken.safeTransfer(actualRef, referralPaid);
                    emit ReferralPaid(actualRef, referralPaid);
                } else {
                    // skip payment if for any reason contract doesn't have sufficient balance
                    referralPaid = 0;
                }
            }
        }

        // If first time staking, set lastClaim to now (cast to uint48)
        if (s.amount == 0) {
            s.lastClaim = uint48(block.timestamp);
        }

        // Update staked amount (only write once)
        uint256 newAmount = s.amount + amount;
        if (newAmount != s.amount) {
            s.amount = newAmount;
        }

        emit Staked(sender, amount, actualRef, referralPaid);
    }

    // Claim reward: once per 24h
    /// @notice Claim the daily ROI (1% of principal). Enforced once per 24h.
    function claimReward() external nonReentrant {
        address sender = msg.sender;
        require(!_paused, "paused");

        StakeInfo storage s = _stakes[sender];
        require(s.amount > 0, "No stake"); // Amount should be greater than 0

        // compute reward
        uint256 reward = _calculateReward(sender);
        require(reward  > 0, "No reward yet"); // Reward should be greater than 0 and 24 hr should have passed

        // update lastClaim before transfer
        s.lastClaim = uint48(block.timestamp);

        stakingToken.safeTransfer(sender, reward);
        emit Claimed(sender, reward);
    }

    // Unstake (withdraw principal only)
    /// @notice Unstake all principal (rewards must be claimed separately)
    function unstake() external nonReentrant {
        address sender = msg.sender;
        require(!_paused, "paused");

        StakeInfo storage s = _stakes[sender];
        require(s.amount > 0, "Nothing staked");

        uint256 amount = s.amount;

        // clear storage efficiently
        delete _stakes[sender];

        stakingToken.safeTransfer(sender, amount);
        emit Unstaked(sender, amount);
    }

    // Internal reward calculation (view)
    /// @dev returns 0 if not claimable yet (less than 24h)
    function _calculateReward(address user) internal view returns (uint256) {
        StakeInfo storage s = _stakes[user];
        if (s.amount == 0) return 0;

        // calculate elapsed time since last claim
        uint256 timePassed = block.timestamp - uint256(s.lastClaim);
        if (timePassed < CLAIM_INTERVAL) return 0;

        // reward = amount * DAILY_ROI_BPS / BPS_DENOM  (for 24h)
        // If more than 24h passed, we pro-rate across timePassed/1 day:
        unchecked {
            return (s.amount * DAILY_ROI_BPS * timePassed) / (BPS_DENOM * CLAIM_INTERVAL);
        }
    }

    // Views
    function getPendingReward(address user) external view returns (uint256) {
        return _calculateReward(user);
    }

    function referrerOf(address user) external view returns (address) {
        return _referrers[user];
    }

    function stakeInfo(address user) external view returns (uint256 amount, uint48 lastClaim) {
        StakeInfo storage s = _stakes[user];
        return (s.amount, s.lastClaim);
    }

    // Admin functions

    /// @notice Pause contract operations (only owner)
    function pause() external payable onlyOwner {
        if (!_paused) {
            _paused = true;
            emit Paused(msg.sender);
        }
    }

    /// @notice Unpause contract operations (only owner)
    function unpause() external payable onlyOwner {
        if (_paused) {
            _paused = false;
            emit Unpaused(msg.sender);
        }
    }

    /// @notice Owner can withdraw tokens from contract (nonReentrant placed first)
    /// @dev nonReentrant before onlyOwner to ensure guard can't be bypassed
    function ownerWithdraw(IERC20 token, uint256 amount) external nonReentrant onlyOwner payable {
        require(address(token) != address(0), "token zero");
        require(amount  >  0, "Invalid amount");

        uint256 bal = token.balanceOf(address(this));
        require(bal >= amount, "insufficient");

        token.safeTransfer(owner(), amount);
        emit OwnerWithdraw(address(token), amount, owner());
    }
}
