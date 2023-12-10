export async function logInConsole(tabId: number, message: string) {
  chrome.scripting.executeScript({
    target: { tabId },
    args: [message],
    func: (msg: string) => console.log("Ecometrics : " + msg),
  });
}
