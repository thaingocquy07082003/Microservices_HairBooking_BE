function isValidAddress(address: string): boolean {
  return (
    this.web3.utils.isHexStrict(address) &&
    (address.length === 42 || address.length === 40) &&
    this.web3.utils.checkAddressChecksum(address)
  );
}
