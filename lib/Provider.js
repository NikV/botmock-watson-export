module.exports = class Provider {
  constructor(p) {
    const mod = require(`./${p.replace(/^\w/, p.substr(0, 1).toUpperCase())}`);
    this.platform = new mod();
  }
  create(type, payload) {
    return this.platform[type](payload);
  }
};
