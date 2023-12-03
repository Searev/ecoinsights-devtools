export const BRIDGE_CONNECTION = "ecometrics-browser";

/**
 * Message envoyé depuis le DevTools
 */
export enum DevtoolsCommandType {
  INJECT_PROBE,
  GET_PAGE_INFO,
  GET_PAGE_DESCRIPTION,
  GET_PAGE_DOM_SIZE,
  LISTEN_DOM_PROFILE,
  LISTEN_URL_CHANGES,
  STOP_LISTEN_DOM_PROFILE,
  STOP_LISTEN_URL_CHANGES,
  LOG_INTO_CONSOLE,
  REFRESH_PAGE,
}

export interface DevtoolCommand {
  command: DevtoolsCommandType;
  tabId: number;
  extra?: any;
}

/**
 * Message envoyé depuis un Content Script
 */
export enum ContentScriptMessageType {
  LINK_CLICKED,
  FORM_SUBMITTED,
}

export interface ContentScriptMessage {
  type: ContentScriptMessageType;
  content: string;
}

/**
 * Message envoyé depuis le Background Script
 */
export interface BackgroundCommandResponse {
  origin: "command";
  context: DevtoolCommand;
  response: any;
}

export interface BackgroundContentScriptMessage {
  origin: "content-script";
  tabId: number;
  message: ContentScriptMessage;
}

export type BackgroundMessage =
  | BackgroundCommandResponse
  | BackgroundContentScriptMessage;
