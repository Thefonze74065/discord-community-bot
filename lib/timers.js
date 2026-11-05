/** Shared timer helpers for the recurring setTimeout patterns across the bot. */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function expireKey(map, key, ms) {
  return setTimeout(() => map.delete(key), ms);
}

function runAfter(ms, fn) {
  return setTimeout(fn, ms);
}

function withTimeout(promise, ms, onTimeout) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      try {
        resolve(onTimeout());
      } catch (error) {
        reject(error);
      }
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function startInterval(fn, ms) {
  let running = false;
  return setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } finally {
      running = false;
    }
  }, ms);
}

module.exports = { sleep, expireKey, runAfter, withTimeout, startInterval };
