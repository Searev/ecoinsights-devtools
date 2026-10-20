import { ContentAnalyser } from "../../domain/models/content-analyser";
import { ContentJob, ContentOutcome } from "../../domain/models/text-content";

const FAKE_CHARACTERS = 50_000;

/**
 * Dev-only analyser (`npm run dev`): no content, no scan. A URL containing ".min." is analysed with
 * 1 % removable characters (minified), any other with 20 % (not minified).
 */
export class FakeContentAnalyser implements ContentAnalyser {
  async analyse(job: ContentJob): Promise<ContentOutcome> {
    const share = job.url.includes(".min.") ? 0.01 : 0.2;
    return {
      status: "analysed",
      characters: FAKE_CHARACTERS,
      removableCharacters: Math.round(FAKE_CHARACTERS * share),
    };
  }
}
