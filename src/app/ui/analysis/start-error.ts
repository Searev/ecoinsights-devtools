import { AgentError } from "../../../shared/protocol";

/** French, user-facing explanation of why an analysis could not start. */
export function describeStartError(error: unknown): string {
  if (error instanceof AgentError) {
    switch (error.code) {
      case "NO_PERMISSION":
        return "L'extension n'a pas la permission d'accéder à cet onglet. Autorisez-la pour ce site dans le menu « Extensions » de votre navigateur, puis réessayez.";
      case "TIMEOUT":
        return "L'onglet inspecté ne répond pas. Vérifiez que la page est chargée, puis réessayez.";
      case "DISCONNECTED":
        return "La connexion avec l'onglet inspecté a été interrompue. Réessayez.";
      default:
        return `Une erreur est survenue au démarrage de l'analyse (${error.message}).`;
    }
  }
  return "Une erreur inattendue est survenue au démarrage de l'analyse.";
}
