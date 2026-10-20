import { IframePreviewSubject } from "../../../domain/models/file-preview";
import { iframeInfoRows } from "./iframe-format";
import { PreviewInfoList } from "./PreviewInfoList";

/** US-017: data only. Creates no `<iframe>` and makes no request. */
export function IframePreviewBody(props: { subject: IframePreviewSubject }) {
  return <PreviewInfoList rows={iframeInfoRows(props.subject)} />;
}
