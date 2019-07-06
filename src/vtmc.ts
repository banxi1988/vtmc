#!/usr/bin/env node
/* vim: set ts=8 sts=8 sw=8 noet: */

import fs from "fs";

import extsprintf from "extsprintf";
const ansiterm = require("ansiterm");
interface Size {
  w: number;
  h: number;
}

const sprintf = extsprintf.sprintf;

enum Intensity {
  MIN = 232, // gray3 #080808
  MAX = 255 // gray93 #eeeee
}

const BLUE_RAMP = [
  16,
  17,
  17,
  18,
  18,
  19,
  19,
  20,
  20,
  21,
  27,
  32,
  33,
  38,
  39,
  44,
  45,
  45,
  81,
  81,
  51,
  51,
  123,
  123
];

function blue_ramp(ival: number) {
  return BLUE_RAMP[ival - Intensity.MIN];
}

function maxLineWidth(lines: string[]) {
  let max = 1;
  for (let line of lines) {
    max = Math.max(max, line.trimRight().length);
  }
  return max;
}

class Slide {
  lines: string[];
  constructor(lines: string[]) {
    this.lines = lines;
  }
  findBound() {
    return {
      width: maxLineWidth(this.lines),
      height: this.lines.length
    };
  }
}

const term = new ansiterm.ANSITerm();
class Deckterm {
  constructor() {}

  writeText(text: string, blue: boolean, intensity: number) {
    term.color256(blue ? blue_ramp(intensity) : intensity);
    term.write(text);
  }

  writeHeading(text: string, intensity: number, voffset: number) {
    const toffset = Math.round(term.size().w / 2 - text.length / 2);

    term.moveto(1 + toffset, voffset);
    this.writeText(text, true, intensity);
  }

  writeLine({
    line,
    intensity,
    offset,
    voffset
  }: {
    line: string;
    intensity: number;
    offset: number;
    voffset: number;
  }) {
    let blue_on = false;
    let escape = false;
    let partial = "";

    if (line[0] === "%") {
      this.writeHeading(line.substr(1).trim(), intensity, voffset);
      return;
    }

    term.moveto(offset, voffset);

    for (const c of line) {
      if (escape) {
        partial += c;
        continue;
      }

      switch (c) {
        case "\\":
          escape = true;
          break;
        case "~":
          if (partial.length > 0) {
            this.writeText(partial, blue_on, intensity);
            partial = "";
          }
          blue_on = !blue_on;
          break;
        default:
          partial += c;
          break;
      }
    }

    if (partial.length > 0) this.writeText(partial, blue_on, intensity);
  }

  textLeft(text: string, row: number) {
    if (!text) return;
    term.moveto(3, row);
    term.write(text);
  }

  textRight(text: string, row: number) {
    if (!text) return;
    term.moveto(-3 - text.length, row);
    term.write(text);
  }

  textCenter(text: string, row: number) {
    if (!text) return;
    term.moveto(Math.round(term.size().w / 2 - text.length / 2), row);
    term.write(text);
  }
}

class Deck {
  slide_seperator: string;
  iterm: Deckterm;
  working: boolean;
  slides: Slide[];
  pos: number;
  deckPath: string = "";
  opts: any;
  constructor() {
    this.slide_seperator = "---分页---";
    this.iterm = new Deckterm();
    this.working = false;
    this.slides = [];
    this.pos = 0;
    this.opts = {
      header: {
        center: "Linux/Unix 命令行生存指南"
      },
      footer: {
        left: "CodeTalks",
        right: "2019/07/05",
        center: "0/0"
      }
    };
  }

  loadDeck(deckPath: string) {
    this.deckPath = deckPath;
    const body = fs.readFileSync(deckPath, "utf8");
    const slides = [];
    const body_lines = body.split("\n");
    let slide_lines = [];
    for (const line of body_lines) {
      if (line.includes(this.slide_seperator)) {
        const slide = new Slide(slide_lines);
        slide_lines = [];
        slides.push(slide);
      } else {
        slide_lines.push(line);
      }
    }
    if (slide_lines.length > 0) {
      slides.push(new Slide(slide_lines));
    }
    this.slides = slides;
    this.updateCurrentSlideIndicator();
  }
  updateCurrentSlideIndicator() {
    this.opts.footer.center = `${this.pos + 1}/${this.slides.length}`;
  }

  drawSurrounds() {
    this.updateCurrentSlideIndicator();
    term.colour256(208); /* XXX maybe people don't just want orange? */
    this.doOne("header", 1);
    this.doOne("footer", -1);
  }
  doOne(key: string, row: number) {
    const opts = this.opts;
    const iterm = this.iterm;
    if (!opts[key]) return;
    iterm.textLeft(opts[key].left, row);
    iterm.textRight(opts[key].right, row);
    iterm.textCenter(opts[key].center, row);
  }

  displaySlide(slide: Slide) {
    console.info("diplay slide ", this.pos);
    term.clear();
    this.drawSurrounds();
    // const prevSlide = this.slides[this.pos - 1];
    this.fade(slide);
  }
  fade(slide: Slide) {
    if (!slide) {
      return;
    }
    const { width, height } = slide.findBound();
    const offset = Math.round(term.size().w / 2 - width / 2) + 1;
    const voffset = Math.round((term.size().h - 2) / 2 - height / 2) + 2;
    let i = 0;
    for (const line of slide.lines) {
      this.iterm.writeLine({
        line,
        intensity: Intensity.MAX,
        offset,
        voffset: voffset + i
      });
      i++;
    }
  }

  showCurrent() {
    const pos = this.pos;
    if (pos < 0 || pos >= this.slides.length) {
      return;
    }
    const slide = this.slides[pos];
    this.displaySlide(slide);
    this.working = false;
  }

  showNext() {
    if (this.pos < this.slides.length - 1) {
      this.pos += 1;
    }
    this.showCurrent();
  }
  showPrev() {
    if (this.pos > 0) {
      this.pos -= 1;
    }
    this.showCurrent();
  }

  show() {
    this.setupTerminal();
    this.checkSize(term.size);
  }

  setupTerminal() {
    term.clear();
    term.cursor(false);
    term.on("resize", (size: Size) => this.onResize(size));
    term.on("keypress", (key: string) => {
      if (key === "q") {
        this.onQuit();
      }
      if (this.working) return;
      this.working = true;
      if (key === "j") {
        this.showNext();
      } else if (key === "k") {
        this.showPrev();
      } else {
        setImmediate(() => {
          this.working = false;
        });
      }
    });
  }

  findBound() {
    let maxw = 0;
    let maxh = 0;
    for (const slide of this.slides) {
      const bound = slide.findBound();
      maxw = Math.max(bound.width, maxw);
      maxh = Math.max(bound.height, maxh);
    }
    return {
      width: maxw,
      height: maxh
    };
  }

  onResize(size: Size) {
    this.checkSize(size);
  }

  checkSize(size: Size) {
    term.clear();
    this.working = true;
    const { width, height } = this.findBound();
    if (width >= size.w || height >= size.h - 3) {
      const msg = `(${width},${height})<(${size.w}, ${size.h - 3})!`;
      term.clear();
      term.moveto(
        Math.floor(size.w / 2 - msg.length / 2),
        Math.floor(size.h / 2)
      );
      term.colour256(196);
      term.write(msg);
    } else {
      this.showCurrent();
    }
  }

  onQuit() {
    term.clear();
    term.moveto(1, 1);
    process.exit(0);
  }
}

const deck = new Deck();

/*
 * Main program:
 */

function main(argv: string[]) {
  const command = argv[0];

  if (command !== "show" && command !== "size") {
    const usage = `
    Usage: vtmc COMMAND <deck_file>

    Commands:

         show     present slideshow
         size     measure required terminal size for deck;

    Control Keys:

         j        next slide
         k        previous slide
         r        reload current slide
         q        quit
    `;
    console.error(usage);
    process.exit(1);
  }
  if (!argv[1]) {
    console.error("missing deck_file");
    return;
  }
  const deck_file = argv[1];

  try {
    deck.loadDeck(deck_file);
  } catch (ex) {
    console.error("ERROR: could not load slide deck: %s", ex.message);
    process.exit(5);
  }

  if (command === "show") {
    deck.show();
  } else {
    console.log("slide size report:");
    console.log("");
    const { width, height } = deck.findBound();
    console.log("");
    console.log(sprintf("required:  %3d x %3d", width, height));
    console.log(
      sprintf(
        "current:   %3d x %3d",
        process.stdout.columns,
        process.stdout.rows
      )
    );
    process.exit(0);
  }
}

main(process.argv.slice(2));
