const mockProvider = require("./mockProvider");

const providers = new Map([[mockProvider.name, mockProvider]]);

function getProvider(name) {
  const provider = providers.get(name);
  if (!provider) {
    throw new Error(`Unsupported payment provider: ${name}`);
  }
  return provider;
}

module.exports = {
  getProvider,
};
