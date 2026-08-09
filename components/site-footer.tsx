import { Info } from "lucide-react";

import { Separator } from "@/components/ui/separator";

/** Lucide dropped brand marks, so the X logo is inlined. */
function XLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      className={className}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-14 border-t border-border pt-6">
      <div className="rounded-xl border border-border bg-card/40 p-5">
        <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Info className="size-3.5" />
          Disclaimer
        </p>

        <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <li>
            Titles, abstracts, authors and metadata are retrieved from{" "}
            <a
              href="https://arxiv.org/archive/q-fin"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2 hover:text-primary"
            >
              arXiv.org
            </a>
            . This is an independent reader and is not affiliated with, endorsed by,
            or operated by arXiv or Cornell University. Copyright in each paper
            remains with its authors under the licence they selected on arXiv.
          </li>
          <li>
            Summaries, key findings and topic tags on this site are generated
            automatically from the abstract by sentence ranking. They can drop
            context, overstate a result, or emphasise the wrong sentence. Use them to
            decide what is worth opening — never as a citable source or a substitute
            for reading the paper.
          </li>
          <li>
            arXiv submissions are preprints. Most have not been peer reviewed, and
            versions may be revised or withdrawn after publication here.
          </li>
          <li>
            Nothing on this site is investment, financial, legal or trading advice.
            Research is presented for information only; any decision you make from it
            is your own.
          </li>
        </ul>
      </div>

      <Separator className="my-5" />

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p>Thank you to arXiv for use of its open access interoperability.</p>

        <a
          href="https://x.com/Ravindra_PE"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <XLogo className="size-3" />
          <span>@Ravindra_PE</span>
        </a>
      </div>
    </footer>
  );
}
