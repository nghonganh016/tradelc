// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/LetterOfCredit.sol";
import "../src/MockUSD.sol";

contract Deploy is Script {
    function run() external {
        address importer = vm.envAddress("IMPORTER");
        address exporter = vm.envAddress("EXPORTER");
        address issuingBank = vm.envAddress("ISSUING_BANK");
        address advisingBank = vm.envAddress("ADVISING_BANK");

        vm.startBroadcast();

        MockUSD usd = new MockUSD();
        LetterOfCredit lc = new LetterOfCredit(address(usd));

        lc.grantRole(lc.IMPORTER_ROLE(), importer);
        lc.grantRole(lc.EXPORTER_ROLE(), exporter);
        lc.grantRole(lc.ISSUINGBANK_ROLE(), issuingBank);
        lc.grantRole(lc.ADVISINGBANK_ROLE(), advisingBank);

        usd.mint(importer, 10_000e18); // 10.000 mUSD cho Importer thử nghiệm

        vm.stopBroadcast();

        console.log("MockUSD:", address(usd));
        console.log("LetterOfCredit:", address(lc));
    }
}
