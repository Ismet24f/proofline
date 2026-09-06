import net from 'node:net';

const denyNetwork = () => {
  throw new Error('PROOFLINE_NETWORK_FORBIDDEN');
};

net.Socket.prototype.connect = denyNetwork;
globalThis.fetch = async () => denyNetwork();
