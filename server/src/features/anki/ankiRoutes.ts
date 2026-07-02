// Fake AnkiConnect endpoint that speaks just enough of the AnkiConnect
// protocol for the handshake (version/requestPermission/apiReflect), the
// deck/model/field metadata a client needs to map fields, and addNote — which
// saves the word into the signed-in user's SRS list.
//
// Mounted at TWO paths (app.ts) that share the same dispatcher but serialize
// replies differently, because two real clients disagree on the wire format:
//   - /api/yomitan-sync (`ankiRoutes`): Yomitan's own AnkiConnect client reads
//     the WHOLE response body as the result and only treats it as a failure
//     if the body contains an `error` field — it does NOT unwrap a `{ result }`
//     envelope (verified empirically: wrapping success replies broke
//     `getDeckNames` with "Unexpected type: expected string[], received
//     object"). So success replies here are the bare/unwrapped value.
//   - /api/anki-sync (`ankiConnectRoutes`): standards-compliant AnkiConnect
//     clients (e.g. Hoshi Reader on iOS) expect the real AnkiConnect wire
//     format `{ result, error }`, and some (Swift's JSONSerialization without
//     .fragmentsAllowed) additionally reject a bare JSON scalar at the top
//     level (e.g. a bare `6` for `version`), so replies here are always
//     wrapped in an object.
//
// Which user? The client sends its configured "API Key" as `body.key`; we
// resolve it to a user via the stable per-user key (see auth/userStore). The
// protocol logic lives in ankiProtocol.handleAction (pure, with I/O
// injected); this file is the thin HTTP adapter. CORS is handled globally in
// app.ts (app.use(cors())), which answers the preflight OPTIONS and sets
// Access-Control-Allow-Origin: *.
import { Router } from "express";
import { wrap } from "../../core/middleware.js";
import { userIdByApiKey } from "../auth/userStore.js";
import { AnkiDeps, AnkiReply, handleAction } from "./ankiProtocol.js";
import * as ankiStore from "./ankiStore.js";

const deps: AnkiDeps = {
  resolveUser: userIdByApiKey,
  saveNote: ankiStore.saveNote,
};

function serializeReply(reply: AnkiReply, wrapInResultEnvelope: boolean): unknown {
  if (wrapInResultEnvelope) {
    return reply.kind === "result"
      ? { result: reply.value, error: null }
      : { result: null, error: reply.message };
  }
  return reply.kind === "result" ? reply.value : { error: reply.message };
}

function makeAnkiRouter(wrapInResultEnvelope: boolean): Router {
  const router = Router();
  router.post(
    "/",
    wrap(async (req, res) => {
      const action = String(req.body?.action ?? "");
      const params = (req.body?.params ?? {}) as Record<string, unknown>;
      // ?src=&tgt= optionally pin the language pair (else detected / default vi).
      const opts = {
        srcLang: req.query.src ? String(req.query.src) : undefined,
        tgtLang: req.query.tgt ? String(req.query.tgt) : undefined,
      };

      const reply = await handleAction(action, params, req.body?.key, opts, deps);
      // Both go out as HTTP 200 so the client reads our message instead of a
      // generic connection error (see the module doc comment above for why
      // the two mount points serialize `reply` differently).
      res.json(serializeReply(reply, wrapInResultEnvelope));
    }),
  );
  return router;
}

export const ankiRoutes = makeAnkiRouter(false);
export const ankiConnectRoutes = makeAnkiRouter(true);
