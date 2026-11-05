const { test, describe, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const logger = require("../lib/logger");
const { createExecute, guard } = require("../lib/commandWrapper");

function fakeInteraction() {
  const calls = [];
  return {
    calls,
    deferReply: async (opts) => void calls.push(["deferReply", opts]),
    editReply: async (payload) => void calls.push(["editReply", payload]),
  };
}

let errorLog;
beforeEach(() => {
  errorLog = mock.method(logger, "error", () => {});
});
afterEach(() => mock.restoreAll());

describe("createExecute", () => {
  test("defers with the given options before running the handler", async () => {
    const interaction = fakeInteraction();
    const execute = createExecute({ ephemeral: true }, async (i) => {
      i.calls.push(["handler"]);
      return "done";
    });

    assert.equal(await execute(interaction), "done");
    assert.deepEqual(interaction.calls, [
      ["deferReply", { ephemeral: true }],
      ["handler"],
    ]);
  });

  test("passes empty options through, and null skips deferring", async () => {
    const a = fakeInteraction();
    await createExecute({}, async () => {})(a);
    assert.deepEqual(a.calls, [["deferReply", {}]]);

    const b = fakeInteraction();
    await createExecute(null, async () => {})(b);
    assert.deepEqual(b.calls, []);
  });

  test("handler errors propagate to the caller", async () => {
    const execute = createExecute({}, async () => {
      throw new Error("boom");
    });
    await assert.rejects(execute(fakeInteraction()), /boom/);
  });
});

describe("guard", () => {
  test("returns the result and sends nothing on success", async () => {
    const interaction = fakeInteraction();
    const result = await guard(
      interaction,
      { logMessage: "x", errorReply: { content: "failed" } },
      async () => 42,
    );
    assert.equal(result, 42);
    assert.deepEqual(interaction.calls, []);
    assert.equal(errorLog.mock.callCount(), 0);
  });

  test("logs the error and edits the reply with a static payload", async () => {
    const interaction = fakeInteraction();
    const error = new Error("boom");
    await guard(
      interaction,
      { logMessage: "Error doing thing:", errorReply: { content: "failed" } },
      async () => {
        throw error;
      },
    );
    assert.deepEqual(errorLog.mock.calls[0].arguments, [
      "Error doing thing:",
      error,
    ]);
    assert.deepEqual(interaction.calls, [["editReply", { content: "failed" }]]);
  });

  test("errorReply can choose the payload from the error", async () => {
    const reply = (e) =>
      e.code === 10026 ? { content: "not banned" } : { content: "generic" };
    for (const [code, expected] of [
      [10026, "not banned"],
      [1, "generic"],
    ]) {
      const interaction = fakeInteraction();
      await guard(
        interaction,
        { logMessage: "x", errorReply: reply },
        async () => {
          throw Object.assign(new Error("e"), { code });
        },
      );
      assert.deepEqual(interaction.calls, [
        ["editReply", { content: expected }],
      ]);
    }
  });

  test("errorReply returning null logs but sends no reply", async () => {
    const interaction = fakeInteraction();
    await guard(
      interaction,
      { logMessage: "x", errorReply: () => null },
      async () => {
        throw new Error("boom");
      },
    );
    assert.equal(errorLog.mock.callCount(), 1);
    assert.deepEqual(interaction.calls, []);
  });
});
