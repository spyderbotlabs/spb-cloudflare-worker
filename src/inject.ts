import { SCRIPT_SRC_MARKERS } from './config';

export function scriptLooksTracked(src: string): boolean {
  const lower = (src || '').toLowerCase();
  return SCRIPT_SRC_MARKERS.some((marker) => lower.includes(marker));
}

export function buildInjectTags(scriptOrigin: string, scriptUrl: string): {
  preconnectTag: string;
  scriptTag: string;
} {
  return {
    preconnectTag: `<link rel="preconnect" href="${scriptOrigin}" crossorigin>`,
    scriptTag: `<script async src="${scriptUrl}"></script>`,
  };
}

/**
 * Stream HTML through HTMLRewriter; inject preconnect + wfm.js before </head>
 * only when no existing tracker script[src] is present.
 */
export function injectWfmScript(
  response: Response,
  scriptOrigin: string,
  scriptUrl: string,
): Response {
  let alreadyTagged = false;
  const { preconnectTag, scriptTag } = buildInjectTags(scriptOrigin, scriptUrl);

  const rewriter = new HTMLRewriter()
    .on('script[src]', {
      element(el) {
        if (scriptLooksTracked(el.getAttribute('src') || '')) {
          alreadyTagged = true;
        }
      },
    })
    .on('head', {
      element(el) {
        el.onEndTag((endTag) => {
          if (!alreadyTagged) {
            endTag.before(preconnectTag + scriptTag, { html: true });
          }
        });
      },
    });

  return rewriter.transform(response);
}
