import { SERVER_URL } from "./config.js";
export class OnlineClient {
  constructor(onState, onConnection) {
    this.onState = onState;
    this.onConnection = onConnection;
    this.socket = null;
    this.id = null;
    this.credential = null;
    this.seat = null;
    this.state = null;
  }
  connect() {
    if (this.socket) return Promise.resolve();
    this.socket = window.io(SERVER_URL || location.origin, {
      autoConnect: false,
      timeout: 8000,
      reconnection: true,
    });
    this.socket.on("state", (s) => {
      if (this.id && s.id !== this.id) return;
      this.state = s;
      this.onState(s);
    });
    this.socket.on("connect", () => {
      this.onConnection(true);
      if (this.id)
        this.watch(this.id).catch((e) => this.onConnection(false, e.message));
    });
    this.socket.on("disconnect", () =>
      this.onConnection(false, "Reconnecting…"),
    );
    this.socket.on("connect_error", () =>
      this.onConnection(false, "Online server unavailable"),
    );
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            Error(
              "Online server unavailable. Start the included server or configure its address in js/config.js.",
            ),
          ),
        9000,
      );
      this.socket.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.connect();
    });
  }
  request(event, data) {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected)
        return reject(Error("Not connected. Please wait for reconnection."));
      this.socket.timeout(7000).emit(event, data, (err, r) => {
        if (err)
          return reject(
            Error(
              "Server did not acknowledge. Reconnect to check the game before retrying.",
            ),
          );
        if (!r?.ok) return reject(Error(r?.error || "Request failed"));
        resolve(r);
      });
    });
  }
  apply(r) {
    this.id = r.state.id;
    this.state = r.state;
    if (r.seat !== undefined) this.seat = r.seat;
    if (r.credential) {
      this.credential = r.credential;
      localStorage.setItem("jenga-seat:" + this.id, this.credential);
    }
    this.onState(r.state);
    return r;
  }
  async create(data) {
    await this.connect();
    return this.apply(await this.request("create", data));
  }
  async watch(id) {
    this.id = id;
    this.credential = localStorage.getItem("jenga-seat:" + id);
    return this.apply(
      await this.request("watch", { id, credential: this.credential }),
    );
  }
  async open(id) {
    await this.connect();
    return this.watch(id);
  }
  async join(name) {
    return this.apply(await this.request("join", { id: this.id, name }));
  }
  async command(action, data = {}) {
    const payload = {
      id: this.id,
      credential: this.credential,
      version: this.state.version,
      commandId: crypto.randomUUID(),
      action,
      ...data,
    };
    try {
      return this.apply(await this.request("command", payload));
    } catch (e) {
      await this.watch(this.id).catch(() => {});
      throw e;
    }
  }
  close() {
    this.socket?.disconnect();
    this.socket = null;
    this.id = null;
    this.state = null;
    this.seat = null;
  }
}
