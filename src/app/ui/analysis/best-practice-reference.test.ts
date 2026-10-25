import { describe, expect, it } from "vitest";
import { RULE_METADATA } from "../../domain/best-practices/rule-metadata";
import { referenceViewFor } from "./best-practice-reference";
import { parseRichText } from "./rich-text";

describe("referenceViewFor", () => {
  it("builds the full view of AddCacheHeaders (scenario 1)", () => {
    expect(referenceViewFor("AddCacheHeaders")).toEqual({
      label: "RWEB 0075",
      description: parseRichText(RULE_METADATA.AddCacheHeaders.description!),
      link: {
        url: "https://rweb.greenit.fr/fr/fiches/RWEB_0075-ajouter-des-entetes-expires-ou-cache-control",
        label: "Consulter la fiche RWEB 0075",
      },
      source: "Source : référentiel RWEB (GreenIT.fr)",
    });
  });

  it("gives the LimitRequests sheet URL and label (scenario 2)", () => {
    expect(referenceViewFor("LimitRequests").link).toEqual({
      url: "https://rweb.greenit.fr/fr/fiches/RWEB_0047-limiter-le-nombre-de-requetes-http",
      label: "Consulter la fiche RWEB 0047",
    });
  });

  it("uses the RGAA wording (scenario 3)", () => {
    const view = referenceViewFor("ProvideTextAlternatives");
    expect(view.label).toBe("RGAA 1.1");
    expect(view.link).toEqual({
      url: "https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/#1.1",
      label: "Consulter le critère RGAA 1.1",
    });
    expect(view.source).toBe("Source : RGAA 4.1 (DINUM)");
  });

  it("shows the corrected RWEB 0076 for CompressTextFiles (scenario 5)", () => {
    const view = referenceViewFor("CompressTextFiles");
    expect(view.label).toBe("RWEB 0076");
    expect(view.link?.label).toBe("Consulter la fiche RWEB 0076");
  });

  it("returns {} for an unknown id (saved analyses of a removed rule, scenario 7)", () => {
    expect(referenceViewFor("Unknown")).toEqual({});
  });
});
