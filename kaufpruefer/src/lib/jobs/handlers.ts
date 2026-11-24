import "server-only";
import { chatCheckJobHandler } from "../chat/service";
import { videoJobHandler } from "../video/jobs";
import { registerJobHandler } from "./queue";

/** Registriert alle Job-Handler (wird von der Queue bei Bedarf geladen). */
registerJobHandler("video_frames", videoJobHandler);
registerJobHandler("chat_check", chatCheckJobHandler);
