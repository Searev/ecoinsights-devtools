import { NetworkRequest } from "../../domain/models/network-request";
import { abbreviate } from "../../helpers/strings.helper";

export default function UrlAbbr(props: { request: NetworkRequest }) {
  const getFileName = () => {
    const fileName =
      props.request.url.pathname
        .split("/")
        .filter((el) => el.trim().length > 0)
        .splice(-1)[0] ?? "";

    return abbreviate(fileName, 40);
  };

  return (
    <abbr title={props.request.method + " " + props.request.url.pathname}>
      {getFileName()}
    </abbr>
  );
}
