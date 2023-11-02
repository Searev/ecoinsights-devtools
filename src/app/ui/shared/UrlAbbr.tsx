import { NetworkRequest } from "../../domain/models/network-request";

export default function UrlAbbr(props: { request: NetworkRequest }) {
  const getFileName = () =>
    props.request.url.pathname
      .split("/")
      .filter((el) => el.trim().length > 0)
      .splice(-1)[0]
      ?.substring(0, 40) ?? "";

  return (
    <abbr title={props.request.method + " " + props.request.url.pathname}>
      {getFileName()}
    </abbr>
  );
}
