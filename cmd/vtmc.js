#!/usr/bin/env node
"use strict";
/* vim: set ts=8 sts=8 sw=8 noet: */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const extsprintf_1 = __importDefault(require("extsprintf"));
const ansiterm = require("ansiterm");
const sprintf = extsprintf_1.default.sprintf;
var Intensity;
(function (Intensity) {
    Intensity[Intensity["MIN"] = 232] = "MIN";
    Intensity[Intensity["MAX"] = 255] = "MAX"; // gray93 #eeeee
})(Intensity || (Intensity = {}));
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
function blue_ramp(ival) {
    return BLUE_RAMP[ival - Intensity.MIN];
}
function maxLineWidth(lines) {
    let max = 1;
    for (let line of lines) {
        max = Math.max(max, line.trimRight().length);
    }
    return max;
}
class Slide {
    constructor(lines) {
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
const SLIDE_OPTS_SEPERATOR = {
    begin: "__slide_opts_begin__",
    end: "__slide_opts_end__"
};
class Deckterm {
    constructor() { }
    writeText(text, blue, intensity) {
        term.color256(blue ? blue_ramp(intensity) : intensity);
        term.write(text);
        // if (blue) {
        //   term.write(chalk.blue(text));
        // } else {
        //   term.write(chalk.redBright(text));
        // }
    }
    writeHeading(text, intensity, voffset) {
        const toffset = Math.round(term.size().w / 2 - text.length / 2);
        term.moveto(1 + toffset, voffset);
        this.writeText(text, true, intensity);
    }
    writeLine({ line, intensity, offset, voffset }) {
        let blue_on = false;
        let escape = false;
        let partial = "";
        if (line[0] === "%" || line[0] === "#") {
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
                case "`":
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
        if (partial.length > 0)
            this.writeText(partial, blue_on, intensity);
    }
    textLeft(text, row) {
        if (!text)
            return;
        term.moveto(3, row);
        term.write(text);
    }
    textRight(text, row) {
        if (!text)
            return;
        term.moveto(-3 - text.length, row);
        term.write(text);
    }
    textCenter(text, row) {
        if (!text)
            return;
        term.moveto(Math.round(term.size().w / 2 - text.length / 2), row);
        term.write(text);
    }
}
class Deck {
    constructor() {
        this.deckPath = "";
        this.slide_seperator = "---分页---";
        this.iterm = new Deckterm();
        this.working = false;
        this.slides = [];
        this.pos = 0;
        this.opts = {};
    }
    loadDeck(deckPath) {
        this.deckPath = deckPath;
        const body = fs_1.default.readFileSync(deckPath, "utf8");
        const slides = [];
        let body_lines = body.split("\n");
        // extract slide_opts if any
        let opts_start = -1;
        let opts_end = -1;
        for (let i = 0; i < body_lines.length; i++) {
            const line = body_lines[i];
            if (line.includes(SLIDE_OPTS_SEPERATOR.begin)) {
                opts_start = i;
            }
            else if (line.includes(SLIDE_OPTS_SEPERATOR.end)) {
                opts_end = i;
            }
            if (opts_start != -1 && opts_end != -1) {
                break;
            }
        }
        if (opts_start != -1 && opts_end != -1) {
            let opts_lines = body_lines.slice(opts_start + 2, opts_end - 1);
            let opts_str = opts_lines.join("\n");
            // console.info("opts_str:\n", opts_str);
            let opts = JSON.parse(opts_str);
            if (opts) {
                this.opts = opts;
            }
            body_lines = body_lines.slice(opts_end + 1);
        }
        // console.info("body_lines:\n");
        // console.info(body_lines);
        // throw Error("inspect body_lines");
        let slide_lines = [];
        for (const line of body_lines) {
            if (line.includes(this.slide_seperator)) {
                const slide = new Slide(slide_lines);
                slide_lines = [];
                slides.push(slide);
            }
            else {
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
    doOne(key, row) {
        const opts = this.opts;
        const iterm = this.iterm;
        if (!opts[key])
            return;
        iterm.textLeft(opts[key].left, row);
        iterm.textRight(opts[key].right, row);
        iterm.textCenter(opts[key].center, row);
    }
    displaySlide(slide) {
        console.info("diplay slide ", this.pos);
        term.clear();
        this.drawSurrounds();
        // const prevSlide = this.slides[this.pos - 1];
        this.fade(slide);
    }
    fade(slide) {
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
        term.bold();
        term.on("resize", (size) => this.onResize(size));
        term.on("keypress", (key) => {
            if (key === "q") {
                this.onQuit();
            }
            if (this.working)
                return;
            this.working = true;
            if (key === "j") {
                this.showNext();
            }
            else if (key === "k") {
                this.showPrev();
            }
            else {
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
    onResize(size) {
        this.checkSize(size);
    }
    checkSize(size) {
        term.clear();
        this.working = true;
        const { width, height } = this.findBound();
        if (width >= size.w || height >= size.h - 3) {
            const msg = `(${width},${height})<(${size.w}, ${size.h - 3})!`;
            term.clear();
            term.moveto(Math.floor(size.w / 2 - msg.length / 2), Math.floor(size.h / 2));
            term.colour256(196);
            term.write(msg);
        }
        else {
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
function main(argv) {
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
    }
    catch (ex) {
        console.error("ERROR: could not load slide deck: %s", ex.message);
        process.exit(5);
    }
    if (command === "show") {
        deck.show();
    }
    else {
        console.log("slide size report:");
        console.log("");
        const { width, height } = deck.findBound();
        console.log("");
        console.log(sprintf("required:  %3d x %3d", width, height));
        console.log(sprintf("current:   %3d x %3d", process.stdout.columns, process.stdout.rows));
        process.exit(0);
    }
}
main(process.argv.slice(2));
