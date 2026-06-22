// Fake AnkiConnect endpoint (mounted at /api/yomitan-sync). A single POST that
// speaks just enough of the AnkiConnect protocol for Yomitan's "+" to work:
// the handshake (version/requestPermission/apiReflect), the deck/model/field
// metadata Yomitan needs to map fields, and addNote — which saves the word into
// the signed-in user's SRS list.
//
// Which user? Yomitan sends its configured "API Key" as `body.key`; we resolve
// it to a user via the stable per-user key (see auth/userStore). The protocol
// logic lives in ankiProtocol.handleAction (pure, with I/O injected); this file
// is the thin HTTP adapter. CORS is handled globally in app.ts (app.use(cors())),
// which answers the preflight OPTIONS and sets Access-Control-Allow-Origin: *.
import { Router } from "express";
import { wrap } from "../../core/middleware.js";
import { userIdByApiKey } from "../auth/userStore.js";
import { AnkiDeps, handleAction } from "./ankiProtocol.js";
import * as ankiStore from "./ankiStore.js";

export const ankiRoutes = Router();

const deps: AnkiDeps = {
  resolveUser: userIdByApiKey,
  saveNote: ankiStore.saveNote,
};

ankiRoutes.post(
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
    // Success replies are the UNWRAPPED value with no error key; failures carry
    // `{ error }`. Both go out as HTTP 200 so Yomitan reads our message instead
    // of a generic connection error (see ankiProtocol.ts for the wire contract).
    res.json(reply.kind === "result" ? reply.value : { error: reply.message });
  }),
);
