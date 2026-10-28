// SPDX-License-Identifier: BSD-3-Clause
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import {
  chromium,
  type Browser,
  type LaunchOptions,
  type Page,
} from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sealEvidenceBundle } from "./helpers/sealed-bundle.js";

// The banner frame check in a real browser, which computes what jsdom does
// not: pseudo-elements, and the transform and margin properties. A module
// whose stylesheet changes how the banner reads is discarded for the
// refusal (presentation contract section 6.2).

const BROWSER_HOOK_TIMEOUT_MS = 60_000;

function browserPath(): string | undefined {
  return [
    process.env.AAC_CHROMIUM_PATH,
    chromium.executablePath(),
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((c) => c !== undefined && c !== "" && existsSync(c));
}
const executablePath = browserPath();

// Every case runs at several zoom levels and with each kind of scrollbar,
// where an honest module must still render. Headless Chrome hides scrollbars
// by default; CI pages meet classic ones, which change the width an auto
// margin resolves to, and a phone or a Mac shows overlay ones.
const CLASSIC = {
  ignoreDefaultArgs: ["--hide-scrollbars"],
  args: ["--disable-features=OverlayScrollbar,FluentOverlayScrollbar"],
};
const SETTINGS: readonly {
  name: string;
  launch: LaunchOptions;
  scale: number;
  css: string;
}[] = [
  { name: "classic scrollbars", launch: CLASSIC, scale: 1, css: "" },
  {
    name: "classic scrollbars, device scale 2",
    launch: CLASSIC,
    scale: 2,
    css: "",
  },
  {
    name: "classic scrollbars, device scale 3",
    launch: CLASSIC,
    scale: 3,
    css: "",
  },
  {
    name: "classic scrollbars, page zoom 50%",
    launch: CLASSIC,
    scale: 1,
    css: "html{zoom:.5}",
  },
  {
    name: "classic scrollbars, page zoom 200%",
    launch: CLASSIC,
    scale: 1,
    css: "html{zoom:2}",
  },
  {
    name: "overlay scrollbars",
    launch: {
      ignoreDefaultArgs: ["--hide-scrollbars"],
      args: ["--enable-features=OverlayScrollbar"],
    },
    scale: 1,
    css: "",
  },
  { name: "hidden scrollbars", launch: {}, scale: 1, css: "" },
];

for (const setting of SETTINGS)
  describe.skipIf(executablePath === undefined)(
    `a module stylesheet that changes how the banner reads, in a browser with ${setting.name}`,
    () => {
      let browser: Browser;
      let page: Page;
      let runtime: string;
      let bundle: unknown;

      beforeAll(async () => {
        browser = await chromium.launch({
          executablePath: executablePath!,
          ...setting.launch,
        });
        const result = await build({
          stdin: {
            contents: [
              'export { renderEvidenceGraph } from "./src/evidence-graph-view.ts";',
              'export { PresentationRegistry } from "./src/presentation-registry.ts";',
            ].join("\n"),
            resolveDir: process.cwd(),
            loader: "ts",
          },
          bundle: true,
          format: "iife",
          globalName: "Frame",
          write: false,
        });
        runtime = result.outputFiles[0]!.text;
        // Nothing is signed, so the page has a details line to protect.
        bundle = (
          await sealEvidenceBundle({
            root: "deal",
            records: [{ capsule_id: "deal" }],
            disclosures: { deal: { agent_input: { step: "open" } } },
          })
        ).bundle;
        page = await browser.newPage({ deviceScaleFactor: setting.scale });
      }, BROWSER_HOOK_TIMEOUT_MS);

      afterAll(async () => {
        await browser?.close();
      }, BROWSER_HOOK_TIMEOUT_MS);

      // Renders the bundle with a module that draws a marker and adds `css`
      // to its region; reports whether the module's content was kept.
      // `scroll` scrolls the element it selects to its first offset before the
      // frame is drawn and to its second while the module renders, as a reader
      // might. `csp` is a page style policy, and `markerStyle` the marker's
      // own style, set through the CSSOM, which no style policy blocks.
      async function kept(
        css: string,
        pageCss = "",
        scroll?: readonly [string, number, number],
        {
          csp,
          markerStyle,
          late,
          hostScript,
        }: {
          csp?: string;
          markerStyle?: string;
          late?: { css: string; when: "timer" | "frame" };
          hostScript?: string;
        } = {},
      ): Promise<boolean> {
        // A fresh document each time: setContent reuses the document, and a
        // policy set in a meta tag would stay with it.
        await page.goto("about:blank");
        // The shell's rule that centres the page with auto margins.
        await page.setContent(
          "<!doctype html><html><head>" +
            (csp === undefined
              ? ""
              : `<meta http-equiv="Content-Security-Policy" content="${csp}">`) +
            "<style>" +
            "body{margin:0}#app{max-width:600px;margin-inline:auto}" +
            setting.css +
            pageCss +
            '</style></head><body><div id="host"></div></body></html>',
        );
        if (hostScript !== undefined)
          await page.addScriptTag({ content: hostScript });
        await page.addScriptTag({ content: runtime });
        return page.evaluate(
          async ({ bundle, css, scroll, markerStyle, late }) => {
            const { renderEvidenceGraph, PresentationRegistry } = (
              globalThis as unknown as {
                Frame: {
                  renderEvidenceGraph: (
                    bundle: unknown,
                    root: HTMLElement,
                    countersigners: undefined,
                    options: { registry: unknown },
                  ) => Promise<void>;
                  PresentationRegistry: new () => {
                    register(module: unknown): void;
                  };
                };
              }
            ).Frame;
            const registry = new PresentationRegistry();
            registry.register({
              manifest: {
                spec_version: "aac.presentation-manifest/v0",
                id: "org.example.banner-test/v0",
                presentation_api: "aac.presentation-api/v0",
                runtime_min: "0.1.0",
                trust_class: "trusted-executable",
                requires: { bundle_kind: "evidence-bundle/v2" },
                audiences: ["*"],
                formats: ["html", "fragment", "embedded"],
                fallback: false,
                priority: 1,
                executable: {
                  carrier: "module-slot",
                  script_sha256: "0".repeat(64),
                },
              },
              canRender: () => {
                if (scroll !== undefined)
                  document.querySelector(scroll[0])!.scrollTop = scroll[1];
                return true;
              },
              buildModel: () => ({}),
              render: (_model: unknown, host: { L1: HTMLElement }) => {
                if (scroll !== undefined)
                  document.querySelector(scroll[0])!.scrollTop = scroll[2];
                (
                  globalThis as { readerScrolls?: () => void }
                ).readerScrolls?.();
                const marker = document.createElement("p");
                marker.dataset.testModule = "";
                if (markerStyle !== undefined)
                  marker.style.cssText = markerStyle;
                host.L1.append(marker);
                const style = document.createElement("style");
                style.textContent = css;
                host.L1.append(style);
                if (late !== undefined) {
                  const add = (): void => {
                    const later = document.createElement("style");
                    later.textContent = late.css;
                    host.L1.append(later);
                  };
                  if (late.when === "timer") setTimeout(add, 0);
                  else requestAnimationFrame(add);
                }
              },
            });
            const root = document.createElement("main");
            root.id = "app";
            document.getElementById("host")!.append(root);
            await renderEvidenceGraph(bundle, root, undefined, { registry });
            return root.querySelector("[data-test-module]") !== null;
          },
          { bundle, css, scroll, markerStyle, late },
        );
      }

      it("one that styles only its own content renders", async () => {
        expect(await kept("[data-test-module]{color:red;margin-top:4px}")).toBe(
          true,
        );
      });

      it("one that makes the page scroll renders", async () => {
        expect(
          await kept(
            "html::-webkit-scrollbar{width:15px}[data-test-module]{height:3000px}",
          ),
        ).toBe(true);
      });

      it("one that makes the page scroll renders where the margin drops to zero", async () => {
        // 10px of room: 5px margins, and none once a 15px scrollbar appears.
        expect(
          await kept(
            "html::-webkit-scrollbar{width:15px}[data-test-module]{height:3000px}",
            "#app{max-width:1270px}",
          ),
        ).toBe(true);
      });

      // An embedded host that places its widget with percentages, whose used px
      // move when the page grows a scrollbar.
      for (const host of [
        "#host{position:absolute;left:50%;transform:translateX(-50%);width:80%}",
        "#host{transform:translateX(-50%);margin-left:50%;width:80%}",
        "body{margin:2%}",
      ])
        it(`one that makes the page scroll renders on a host with ${host}`, async () => {
          expect(
            await kept(
              "html::-webkit-scrollbar{width:15px}[data-test-module]{height:3000px}",
              host,
            ),
          ).toBe(true);
        });

      it("one that moves a positioned host by its bottom offset is discarded", async () => {
        expect(
          await kept(
            "#host{bottom:100vh}",
            "#host{position:absolute;left:50%;transform:translateX(-50%);width:80%}",
          ),
        ).toBe(false);
      });

      it("one that moves a flex-centred host by its bottom margin is discarded", async () => {
        expect(
          await kept(
            "#host{margin-bottom:200vh}",
            "body{display:flex;align-items:center;height:100vh}#host{width:600px;flex:none}",
          ),
        ).toBe(false);
      });

      it("one that shifts each positioned ancestor within the slack is discarded", async () => {
        expect(
          await kept(
            "html,body,#host{top:-9px;margin-top:-9px}",
            "html,body,#host{position:relative}",
          ),
        ).toBe(false);
      });

      // At page zoom 200% a classic scrollbar is 30 viewport px, and a host
      // that floats the widget right moves it by all of it, past the sideways
      // bound; the honest module is discarded, which fails closed (#116).
      it.skipIf(setting.css === "html{zoom:2}")(
        "one that makes the page scroll renders on a host that floats it right",
        async () => {
          expect(
            await kept(
              "html::-webkit-scrollbar{width:15px}[data-test-module]{height:3000px}",
              "#host{float:right;width:500px}",
            ),
          ).toBe(true);
        },
      );

      it("one renders while a reader scrolls a scaled host", async () => {
        expect(
          await kept(
            "[data-test-module]{color:red}",
            "#host{transform:scale(.5);transform-origin:0 0;height:50px;overflow:auto}#host::after{content:'';display:block;height:1000px}",
            ["#host", 100, 0],
          ),
        ).toBe(true);
      });

      it("one renders while a reader scrolls the page", async () => {
        expect(
          await kept(
            "[data-test-module]{color:red}",
            "html{transform:scale(.5);transform-origin:0 0}body{padding-bottom:3000px}",
            ["html", 0, 100],
          ),
        ).toBe(true);
      });

      it("one renders on a flex-centred host", async () => {
        expect(
          await kept(
            "[data-test-module]{color:red}",
            "body{display:flex;align-items:center;height:100vh}#host{width:600px;flex:none}",
          ),
        ).toBe(true);
      });

      it("one renders on a host that already styles the root's ancestors", async () => {
        // Compared before and after the module renders: the host's own styles
        // are no module's doing.
        expect(
          await kept(
            "[data-test-module]{color:red}",
            "html{transform:scale(0.5)}body{opacity:0.5;margin-top:-10px}",
          ),
        ).toBe(true);
      });

      it("one renders while a reader scrolls a rotated host", async () => {
        expect(
          await kept(
            "[data-test-module]{color:red}",
            "#host{transform:rotate(90deg);height:50px;overflow:auto}#host::after{content:'';display:block;height:1000px}",
            ["#host", 100, 0],
          ),
        ).toBe(true);
      });

      it("one renders while a reader scrolls a host of fractional height", async () => {
        expect(
          await kept(
            "[data-test-module]{color:red}",
            "#host{height:100.25px;overflow:auto}#host::after{content:'';display:block;height:30000px}",
            ["#host", 20000, 20000],
          ),
        ).toBe(true);
      });

      // At page zoom 50% the three 9px rises lift the bar by 9 viewport px in
      // all, which the place bound allows.
      it.skipIf(setting.css === "html{zoom:.5}")(
        "one that shifts each ancestor up within the slack is discarded",
        async () => {
          expect(await kept("html,body,#host{margin-top:-9px}")).toBe(false);
        },
      );

      it.skipIf(setting.css === "html{zoom:.5}")(
        "one that makes a scrolled host's height fractional and shifts each ancestor within the slack is discarded",
        async () => {
          expect(
            await kept(
              "#host{height:100.25px}html,body,#host{margin-top:-9px}",
              "#host{height:100px;overflow:auto}#host::after{content:'';display:block;height:30000px}",
              ["#host", 20000, 20000],
            ),
          ).toBe(false);
        },
      );

      it("one that covers a widget lower on a long host page where it first shows is discarded", async () => {
        expect(
          await kept(
            "[data-test-module]{position:fixed;margin:0;top:0;left:0;right:0;height:340px;background:#fff}",
            "#host{margin-top:300px}body{padding-bottom:3000px}",
          ),
        ).toBe(false);
      });

      it("one renders on a host that shows the widget below the first screen under a fixed header", async () => {
        expect(
          await kept(
            "[data-test-module]{color:red}",
            "body::before{content:'';position:fixed;top:0;left:0;right:0;height:80px;background:#fff}#host{margin-top:2000px}body{padding-bottom:3000px}",
          ),
        ).toBe(true);
      });

      it("one that draws a layer over the banner under a page style policy is discarded", async () => {
        // The check's own stylesheet is constructed, which no policy blocks.
        const overlay =
          "position:fixed;margin:0;top:0;left:0;right:0;height:100vh;background:#eee;pointer-events:none";
        expect(
          await kept("", "", undefined, {
            csp: "style-src 'none'",
            markerStyle: overlay,
          }),
        ).toBe(false);
        expect(await kept("", "", undefined, { csp: "style-src 'none'" })).toBe(
          true,
        );
      });

      // Drawn just after render returns, as a module that opens a toolbar or a
      // modal once its data is in might.
      for (const when of ["timer", "frame"] as const) {
        it(`one that draws a layer over the banner on the next ${when} is discarded`, async () => {
          expect(
            await kept("", "", undefined, {
              late: {
                css: "[data-test-module]{position:fixed;margin:0;top:0;left:0;right:0;height:100vh;background:#eee}",
                when,
              },
            }),
          ).toBe(false);
        });

        it(`one that moves the banner on the next ${when} is discarded`, async () => {
          expect(
            await kept("", "", undefined, {
              late: { css: ".cv-shell-bar{margin-top:-100vh}", when },
            }),
          ).toBe(false);
        });

        it(`one that styles its own content on the next ${when} renders`, async () => {
          expect(
            await kept("", "", undefined, {
              late: {
                css: "[data-test-module]{color:red;margin-top:4px}",
                when,
              },
            }),
          ).toBe(true);
        });
      }

      it("one that clips the pill inside a host's clipping rule is discarded", async () => {
        expect(
          await kept(
            ".cv-pill{width:1px}",
            ".cv-pill{display:inline-block;overflow:hidden;white-space:nowrap}",
          ),
        ).toBe(false);
      });

      // Layers a module draws that paint nothing over the banner.
      for (const css of [
        // A closed dialog, faded out.
        "[data-test-module]{position:fixed;inset:0;margin:0;opacity:0;pointer-events:none;background:#fff}",
        // An empty full-page container for toasts.
        "[data-test-module]{position:fixed;inset:0;margin:0;pointer-events:none}",
      ])
        it(`one that adds ${css} renders`, async () => {
          expect(await kept(css)).toBe(true);
        });

      it("one renders on a host whose own layer covers the widget", async () => {
        expect(
          await kept("[data-test-module]{color:red}", "", undefined, {
            hostScript:
              "const cover=document.createElement('nav');cover.style.cssText='position:fixed;inset:0;background:#fff;z-index:1';document.body.append(cover);",
          }),
        ).toBe(true);
      });

      it("one renders on a host that shows a fixed header once the reader scrolls", async () => {
        expect(
          await kept(
            "[data-test-module]{color:red}",
            "#host{margin-top:100px}body{padding-bottom:3000px}",
            ["html", 0, 30],
            {
              hostScript:
                "const header=document.createElement('nav');header.style.cssText='position:fixed;top:0;left:0;right:0;height:120px;background:#fff;display:none';document.body.append(header);addEventListener('scroll',()=>{header.style.display=scrollY>0?'block':'none'});",
            },
          ),
        ).toBe(true);
      });

      it("one that makes a full-width host's page scroll renders", async () => {
        expect(
          await kept(
            "[data-test-module]{height:3000px}",
            "#host{width:100vw}#app{max-width:none}",
          ),
        ).toBe(true);
      });

      it("one renders without moving where the reader has scrolled", async () => {
        expect(
          await kept(
            "[data-test-module]{color:red}",
            // Without scroll anchoring, which moves the offset by itself as
            // the page fills in.
            "#host{height:100px;overflow:auto;overflow-anchor:none}#host::after{content:'';display:block;height:30000px}body{padding-bottom:3000px}",
            ["#host", 0, 700],
          ),
        ).toBe(true);
        expect(
          await page.evaluate(() => [
            document.getElementById("host")!.scrollTop,
            scrollY,
          ]),
        ).toEqual([700, 0]);
      });

      it("one renders without stopping the reader's smooth scroll", async () => {
        expect(
          await kept(
            "[data-test-module]{color:red}",
            "html{scroll-behavior:smooth}body{padding-bottom:5000px}",
            undefined,
            {
              // Called as the module renders: a reader follows a link.
              hostScript:
                "window.readerScrolls=()=>{scrollTo({top:300,behavior:'instant'});scrollTo({top:1000,behavior:'smooth'})};",
            },
          ),
        ).toBe(true);
        await page.waitForFunction(() => scrollY === 1000, undefined, {
          timeout: 3000,
        });
      });

      it("one that shrinks a scrolling host to nothing is discarded", async () => {
        expect(
          await kept("#host{height:0}", "#host{height:400px;overflow:auto}"),
        ).toBe(false);
      });

      for (const css of [
        // Something of the module's, or the module's stylesheet laying out
        // another element, drawn over the banner.
        "head{display:block;position:fixed;inset:0;background:#fff;z-index:2147483647}",
        "style{display:block;position:fixed;inset:0;background:#fff;z-index:2147483647}",
        "[data-test-module]{position:fixed;margin:0;top:0;left:0;right:0;height:100vh;background:#eee}",
        "[data-test-module]{position:fixed;margin:0;top:0;left:0;right:0;height:100vh;background:#eee;pointer-events:none}",
        "[data-test-module][data-test-module]{position:fixed;margin:0;top:0;left:0;right:0;height:100vh;background:#eee;pointer-events:none!important}",
        "[data-test-module]{position:fixed;margin:0;top:0;bottom:0;left:calc(50% - 290px);width:12px;background:#fff}",
        "[data-test-module]{position:fixed;margin:0;top:0;left:0;right:0;height:85px;background:#fff}",
        "html,body,#host{margin-top:9px;padding-top:9px;border-top:9px solid transparent}[data-test-module]{position:fixed;margin:0;top:0;left:0;right:0;height:120px;background:#fff}",
        "html,body,#host{margin-top:9px;padding-top:9px;border-top:9px solid transparent}[data-test-module]{position:fixed;margin:0;top:0;left:0;right:0;height:120px;background:#fff}[data-region=L2]{height:3000px}",
        '[data-banner-detail]::after{content:" These findings do not affect this report."}',
        '[data-verify]::before{content:"Unchanged since it was sealed. "}',
        "[data-verify]{scale:0}",
        ".cv-shell-bar{translate:0 -100vh}",
        ".cv-shell-bar{margin-top:-100vh}",
        ".cv-shell-bar{margin-left:-100vw}",
        ".cv-shell-bar{margin-left:100vw}",
        ".cv-shell-bar{margin-right:-100vw}",
        "#app{margin-left:99vw;margin-right:99vw}",
        ".cv-shell-bar{margin-left:40px}",
        ".cv-shell-bar{margin-left:10px}",
        // A module widens the scrollbar, or reserves a gutter, to make room for
        // the shift.
        "html::-webkit-scrollbar{width:600px}[data-test-module]{height:3000px}.cv-shell-bar{margin-left:550px}",
        "html{scrollbar-gutter:stable both-edges}.cv-shell-bar{margin-left:550px}",
        "html::-webkit-scrollbar{width:90vw}[data-test-module]{height:3000px}.cv-shell-bar{margin-left:-90vw}",
        "[data-verify]{-webkit-text-fill-color:transparent}",
        "[data-verify]{zoom:0.01}",
        "[data-verify]{mask-image:linear-gradient(transparent,transparent)}",
        "[data-verify]{-webkit-mask-image:linear-gradient(transparent,transparent)}",
        // The root's ancestors, which scale, move, clip or hide the banner
        // while every value on the banner itself stays the same.
        "body{zoom:0.01}",
        "html{zoom:0.1}",
        "body{transform:scale(0.01)}",
        "html{transform:scale(0.01)}",
        "body{transform:scale(0.01);transform-origin:0 0}[data-test-module]{transform:scale(100)}",
        "body{scale:0.01}",
        "html{scale:0.01}",
        "body{transform:translateY(-100vh)}",
        "html{translate:0 -100vh}",
        "body{transform:rotateX(90deg)}",
        "body{margin-top:-60px}",
        "html{position:relative;top:-60px}",
        "body{opacity:0}",
        "html{opacity:0}",
        "body{filter:opacity(0)}",
        "html{filter:blur(20px)}",
        "body{clip-path:inset(60px 0 0 0)}",
        "html{clip-path:inset(60px 0 0 0)}",
        "html{mask-image:linear-gradient(transparent,transparent)}",
        "html{content-visibility:hidden}",
        'body::before{content:"";position:fixed;inset:0;background:#fff}',
        "#host{transform:scale(0.01)}",
        "#host{opacity:0}",
        "#host{margin-top:-60px}",
        "#host{position:relative;bottom:100vh}",
        // Padding or a border that pushes the banner's words out of view.
        "#app{padding-top:200vh}",
        "#app{border-top:200vh solid #fff}",
        ".cv-shell-bar{padding-top:200vh}",
        ".cv-shell-bar{padding-left:100vw}",
        ".cv-shell-bar{border-left:100vw solid #fff}",
        "[data-banner-detail]{padding-top:200vh}",
        "[data-banner-detail]{padding-left:100vw}",
        "[data-verify]{padding-left:100vw}",
        // The banner pushed off the first screen, under fixed module content.
        "body{padding-top:200vh}",
        "#host{padding-top:200vh}",
        "html{border-top:200vh solid #fff}",
        "body{padding-top:200vh}[data-test-module]{position:fixed;top:0;left:0;right:0;height:100vh}",
        // Shifts within the slack on each ancestor that add up.
        "html,body,#host{margin-left:-9px}#app{margin-left:-9px}",
        // Paint containment clips the banner.
        "body{contain:strict}",
        "body{contain:paint;height:0}",
        "#app{contain:paint;height:0}",
      ])
        it(`one that adds ${css} is discarded`, async () => {
          expect(await kept(css)).toBe(false);
        });
    },
  );
