// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ERC20Mock
/// @notice Simple ERC20 token used for testing staking contracts
contract ERC20Mock is ERC20 {
    constructor(
        string memory name_,
        string memory symbol_,
        address initialAccount,
        uint256 initialBalance
    ) ERC20(name_, symbol_) {
        _mint(initialAccount, initialBalance);
    }
}
