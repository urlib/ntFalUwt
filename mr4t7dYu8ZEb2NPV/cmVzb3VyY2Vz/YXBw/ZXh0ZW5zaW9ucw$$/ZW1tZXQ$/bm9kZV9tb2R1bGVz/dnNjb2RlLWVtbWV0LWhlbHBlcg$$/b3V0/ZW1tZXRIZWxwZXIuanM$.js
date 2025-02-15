"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_languageserver_types_1 = require("vscode-languageserver-types");
const expand_full_1 = require("./expand/expand-full");
const extract = require("@emmetio/extract-abbreviation");
const path = require("path");
const fs = require("fs");
const JSONC = require("jsonc-parser");
const os_1 = require("os");
const data_1 = require("./data");
const snippetKeyCache = new Map();
let markupSnippetKeys;
let markupSnippetKeysRegex;
const stylesheetCustomSnippetsKeyCache = new Map();
const htmlAbbreviationStartRegex = /^[a-z,A-Z,!,(,[,#,\.]/;
const cssAbbreviationRegex = /^-?[a-z,A-Z,!,@,#]/;
const htmlAbbreviationRegex = /[a-z,A-Z\.]/;
const emmetModes = ['html', 'pug', 'slim', 'haml', 'xml', 'xsl', 'jsx', 'css', 'scss', 'sass', 'less', 'stylus'];
const commonlyUsedTags = [...data_1.htmlData.tags, 'lorem'];
const bemFilterSuffix = 'bem';
const filterDelimitor = '|';
const trimFilterSuffix = 't';
const commentFilterSuffix = 'c';
const maxFilters = 3;
const vendorPrefixes = { 'w': "webkit", 'm': "moz", 's': "ms", 'o': "o" };
const defaultVendorProperties = {
    'w': "animation, animation-delay, animation-direction, animation-duration, animation-fill-mode, animation-iteration-count, animation-name, animation-play-state, animation-timing-function, appearance, backface-visibility, background-clip, background-composite, background-origin, background-size, border-fit, border-horizontal-spacing, border-image, border-vertical-spacing, box-align, box-direction, box-flex, box-flex-group, box-lines, box-ordinal-group, box-orient, box-pack, box-reflect, box-shadow, color-correction, column-break-after, column-break-before, column-break-inside, column-count, column-gap, column-rule-color, column-rule-style, column-rule-width, column-span, column-width, dashboard-region, font-smoothing, highlight, hyphenate-character, hyphenate-limit-after, hyphenate-limit-before, hyphens, line-box-contain, line-break, line-clamp, locale, margin-before-collapse, margin-after-collapse, marquee-direction, marquee-increment, marquee-repetition, marquee-style, mask-attachment, mask-box-image, mask-box-image-outset, mask-box-image-repeat, mask-box-image-slice, mask-box-image-source, mask-box-image-width, mask-clip, mask-composite, mask-image, mask-origin, mask-position, mask-repeat, mask-size, nbsp-mode, perspective, perspective-origin, rtl-ordering, text-combine, text-decorations-in-effect, text-emphasis-color, text-emphasis-position, text-emphasis-style, text-fill-color, text-orientation, text-security, text-stroke-color, text-stroke-width, transform, transition, transform-origin, transform-style, transition-delay, transition-duration, transition-property, transition-timing-function, user-drag, user-modify, user-select, writing-mode, svg-shadow, box-sizing, border-radius",
    'm': "animation-delay, animation-direction, animation-duration, animation-fill-mode, animation-iteration-count, animation-name, animation-play-state, animation-timing-function, appearance, backface-visibility, background-inline-policy, binding, border-bottom-colors, border-image, border-left-colors, border-right-colors, border-top-colors, box-align, box-direction, box-flex, box-ordinal-group, box-orient, box-pack, box-shadow, box-sizing, column-count, column-gap, column-rule-color, column-rule-style, column-rule-width, column-width, float-edge, font-feature-settings, font-language-override, force-broken-image-icon, hyphens, image-region, orient, outline-radius-bottomleft, outline-radius-bottomright, outline-radius-topleft, outline-radius-topright, perspective, perspective-origin, stack-sizing, tab-size, text-blink, text-decoration-color, text-decoration-line, text-decoration-style, text-size-adjust, transform, transform-origin, transform-style, transition, transition-delay, transition-duration, transition-property, transition-timing-function, user-focus, user-input, user-modify, user-select, window-shadow, background-clip, border-radius",
    's': "accelerator, backface-visibility, background-position-x, background-position-y, behavior, block-progression, box-align, box-direction, box-flex, box-line-progression, box-lines, box-ordinal-group, box-orient, box-pack, content-zoom-boundary, content-zoom-boundary-max, content-zoom-boundary-min, content-zoom-chaining, content-zoom-snap, content-zoom-snap-points, content-zoom-snap-type, content-zooming, filter, flow-from, flow-into, font-feature-settings, grid-column, grid-column-align, grid-column-span, grid-columns, grid-layer, grid-row, grid-row-align, grid-row-span, grid-rows, high-contrast-adjust, hyphenate-limit-chars, hyphenate-limit-lines, hyphenate-limit-zone, hyphens, ime-mode, interpolation-mode, layout-flow, layout-grid, layout-grid-char, layout-grid-line, layout-grid-mode, layout-grid-type, line-break, overflow-style, perspective, perspective-origin, perspective-origin-x, perspective-origin-y, scroll-boundary, scroll-boundary-bottom, scroll-boundary-left, scroll-boundary-right, scroll-boundary-top, scroll-chaining, scroll-rails, scroll-snap-points-x, scroll-snap-points-y, scroll-snap-type, scroll-snap-x, scroll-snap-y, scrollbar-arrow-color, scrollbar-base-color, scrollbar-darkshadow-color, scrollbar-face-color, scrollbar-highlight-color, scrollbar-shadow-color, scrollbar-track-color, text-align-last, text-autospace, text-justify, text-kashida-space, text-overflow, text-size-adjust, text-underline-position, touch-action, transform, transform-origin, transform-origin-x, transform-origin-y, transform-origin-z, transform-style, transition, transition-delay, transition-duration, transition-property, transition-timing-function, user-select, word-break, wrap-flow, wrap-margin, wrap-through, writing-mode",
    'o': "dashboard-region, animation, animation-delay, animation-direction, animation-duration, animation-fill-mode, animation-iteration-count, animation-name, animation-play-state, animation-timing-function, border-image, link, link-source, object-fit, object-position, tab-size, table-baseline, transform, transform-origin, transition, transition-delay, transition-duration, transition-property, transition-timing-function, accesskey, input-format, input-required, marquee-dir, marquee-loop, marquee-speed, marquee-style"
};
/**
 * Returns all applicable emmet expansions for abbreviation at given position in a CompletionList
 * @param document TextDocument in which completions are requested
 * @param position Position in the document at which completions are requested
 * @param syntax Emmet supported language
 * @param emmetConfig Emmet Configurations as derived from VS Code
 */
function doComplete(document, position, syntax, emmetConfig) {
    if (emmetConfig.showExpandedAbbreviation === 'never' || !getEmmetMode(syntax, emmetConfig.excludeLanguages)) {
        return;
    }
    // Fetch markupSnippets so that we can provide possible abbreviation completions
    // For example, when text at position is `a`, completions should return `a:blank`, `a:link`, `acr` etc.
    if (!isStyleSheet(syntax)) {
        if (!snippetKeyCache.has(syntax) || !markupSnippetKeysRegex || markupSnippetKeysRegex.length === 0) {
            let registry = customSnippetRegistry[syntax] ? customSnippetRegistry[syntax] : expand_full_1.createSnippetsRegistry(syntax);
            if (!snippetKeyCache.has(syntax)) {
                snippetKeyCache.set(syntax, registry.all({ type: 'string' }).map(snippet => {
                    return snippet.key;
                }));
            }
            markupSnippetKeysRegex = registry.all({ type: 'regexp' }).map(snippet => {
                return snippet.key;
            });
        }
        markupSnippetKeys = snippetKeyCache.get(syntax);
    }
    let extractedValue = extractAbbreviation(document, position, { syntax, lookAhead: !isStyleSheet(syntax) });
    if (!extractedValue) {
        return;
    }
    let { abbreviationRange, abbreviation, filter } = extractedValue;
    let currentLineTillPosition = getCurrentLine(document, position).substr(0, position.character);
    let currentWord = getCurrentWord(currentLineTillPosition);
    // Dont attempt to expand open tags
    if (currentWord === abbreviation
        && currentLineTillPosition.endsWith(`<${abbreviation}`)
        && (syntax === 'html' || syntax === 'xml' || syntax === 'xsl' || syntax === 'jsx')) {
        return;
    }
    // `preferences` is supported in Emmet config to allow backward compatibility
    // `getExpandOptions` converts it into a format understandable by new modules
    // We retain a copy here to be used by the vendor prefixing feature
    let expandOptions = getExpandOptions(syntax, emmetConfig, filter);
    let preferences = expandOptions['preferences'];
    delete expandOptions['preferences'];
    let expandedText;
    let expandedAbbr;
    let completionItems = [];
    // Create completion item after expanding given abbreviation 
    // if abbreviation is valid and expanded value is not noise
    const createExpandedAbbr = (syntax, abbr) => {
        if (!isAbbreviationValid(syntax, abbreviation)) {
            return;
        }
        try {
            expandedText = expand_full_1.expand(abbr, expandOptions);
        }
        catch (e) {
        }
        if (!expandedText || isExpandedTextNoise(syntax, abbr, expandedText)) {
            return;
        }
        expandedAbbr = vscode_languageserver_types_1.CompletionItem.create(abbr);
        expandedAbbr.textEdit = vscode_languageserver_types_1.TextEdit.replace(abbreviationRange, escapeNonTabStopDollar(addFinalTabStop(expandedText)));
        expandedAbbr.documentation = replaceTabStopsWithCursors(expandedText);
        expandedAbbr.insertTextFormat = vscode_languageserver_types_1.InsertTextFormat.Snippet;
        expandedAbbr.detail = 'Emmet Abbreviation';
        expandedAbbr.label = abbreviation;
        expandedAbbr.label += filter ? '|' + filter.replace(',', '|') : "";
        completionItems = [expandedAbbr];
    };
    if (isStyleSheet(syntax)) {
        let { prefixOptions, abbreviationWithoutPrefix } = splitVendorPrefix(abbreviation);
        createExpandedAbbr(syntax, abbreviationWithoutPrefix);
        // When abbr is longer than usual emmet snippets and matches better with existing css property, then no emmet
        if (abbreviationWithoutPrefix.length > 4
            && data_1.cssData.properties.find(x => x.startsWith(abbreviationWithoutPrefix))) {
            return vscode_languageserver_types_1.CompletionList.create([], true);
        }
        if (expandedAbbr) {
            let prefixedExpandedText = applyVendorPrefixes(expandedText, prefixOptions, preferences);
            expandedAbbr.textEdit = vscode_languageserver_types_1.TextEdit.replace(abbreviationRange, escapeNonTabStopDollar(addFinalTabStop(prefixedExpandedText)));
            expandedAbbr.documentation = replaceTabStopsWithCursors(prefixedExpandedText);
            expandedAbbr.label = removeTabStops(expandedText);
            expandedAbbr.filterText = abbreviation;
            // Custom snippets should show up in completions if abbreviation is a prefix
            const stylesheetCustomSnippetsKeys = stylesheetCustomSnippetsKeyCache.has(syntax) ? stylesheetCustomSnippetsKeyCache.get(syntax) : stylesheetCustomSnippetsKeyCache.get('css');
            completionItems = makeSnippetSuggestion(stylesheetCustomSnippetsKeys, abbreviation, abbreviation, abbreviationRange, expandOptions, 'Emmet Custom Snippet', false);
            if (!completionItems.find(x => x.textEdit.newText === expandedAbbr.textEdit.newText)) {
                // Fix for https://github.com/Microsoft/vscode/issues/28933#issuecomment-309236902
                // When user types in propertyname, emmet uses it to match with snippet names, resulting in width -> widows or font-family -> font: family
                // Filter out those cases here.
                const abbrRegex = new RegExp('.*' + abbreviationWithoutPrefix.split('').map(x => (x === '$' || x === '+') ? '\\' + x : x).join('.*') + '.*', 'i');
                if (/\d/.test(abbreviation) || abbrRegex.test(expandedAbbr.label)) {
                    completionItems.push(expandedAbbr);
                }
            }
        }
        // Incomplete abbreviations that use vendor prefix 
        if (!completionItems.length && (abbreviation === '-' || /^-[wmso]{1,4}-?$/.test(abbreviation))) {
            return vscode_languageserver_types_1.CompletionList.create([], true);
        }
    }
    else {
        createExpandedAbbr(syntax, abbreviation);
        let tagToFindMoreSuggestionsFor = abbreviation;
        let newTagMatches = abbreviation.match(/(>|\+)([\w:-]+)$/);
        if (newTagMatches && newTagMatches.length === 3) {
            tagToFindMoreSuggestionsFor = newTagMatches[2];
        }
        let commonlyUsedTagSuggestions = makeSnippetSuggestion(commonlyUsedTags, tagToFindMoreSuggestionsFor, abbreviation, abbreviationRange, expandOptions, 'Emmet Abbreviation');
        completionItems = completionItems.concat(commonlyUsedTagSuggestions);
        if (emmetConfig.showAbbreviationSuggestions === true) {
            let abbreviationSuggestions = makeSnippetSuggestion(markupSnippetKeys.filter(x => !commonlyUsedTags.includes(x)), tagToFindMoreSuggestionsFor, abbreviation, abbreviationRange, expandOptions, 'Emmet Abbreviation');
            // Workaround for the main expanded abbr not appearing before the snippet suggestions
            if (expandedAbbr && abbreviationSuggestions.length > 0 && tagToFindMoreSuggestionsFor !== abbreviation) {
                expandedAbbr.sortText = '0' + expandedAbbr.label;
                abbreviationSuggestions.forEach(item => {
                    // Workaround for snippet suggestions items getting filtered out as the complete abbr does not start with snippetKey 
                    item.filterText = abbreviation;
                    // Workaround for the main expanded abbr not appearing before the snippet suggestions
                    item.sortText = '9' + abbreviation;
                });
            }
            completionItems = completionItems.concat(abbreviationSuggestions);
        }
    }
    if (emmetConfig.showSuggestionsAsSnippets === true) {
        completionItems.forEach(x => x.kind = vscode_languageserver_types_1.CompletionItemKind.Snippet);
    }
    return completionItems.length ? vscode_languageserver_types_1.CompletionList.create(completionItems, true) : undefined;
}
exports.doComplete = doComplete;
/**
 * Create & return snippets for snippet keys that start with given prefix
 */
function makeSnippetSuggestion(snippetKeys, prefix, abbreviation, abbreviationRange, expandOptions, snippetDetail, skipFullMatch = true) {
    if (!prefix || !snippetKeys) {
        return [];
    }
    let snippetCompletions = [];
    snippetKeys.forEach(snippetKey => {
        if (!snippetKey.startsWith(prefix.toLowerCase()) || (skipFullMatch && snippetKey === prefix.toLowerCase())) {
            return;
        }
        let currentAbbr = abbreviation + snippetKey.substr(prefix.length);
        let expandedAbbr;
        try {
            expandedAbbr = expand_full_1.expand(currentAbbr, expandOptions);
        }
        catch (e) {
        }
        if (!expandedAbbr) {
            return;
        }
        let item = vscode_languageserver_types_1.CompletionItem.create(prefix + snippetKey.substr(prefix.length));
        item.documentation = replaceTabStopsWithCursors(expandedAbbr);
        item.detail = snippetDetail;
        item.textEdit = vscode_languageserver_types_1.TextEdit.replace(abbreviationRange, escapeNonTabStopDollar(addFinalTabStop(expandedAbbr)));
        item.insertTextFormat = vscode_languageserver_types_1.InsertTextFormat.Snippet;
        snippetCompletions.push(item);
    });
    return snippetCompletions;
}
function getCurrentWord(currentLineTillPosition) {
    if (currentLineTillPosition) {
        let matches = currentLineTillPosition.match(/[\w,:,-,\.]*$/);
        if (matches) {
            return matches[0];
        }
    }
}
function replaceTabStopsWithCursors(expandedWord) {
    return expandedWord.replace(/([^\\])\$\{\d+\}/g, '$1|').replace(/\$\{\d+:([^\}]+)\}/g, '$1');
}
function removeTabStops(expandedWord) {
    return expandedWord.replace(/([^\\])\$\{\d+\}/g, '$1').replace(/\$\{\d+:([^\}]+)\}/g, '$1');
}
function escapeNonTabStopDollar(text) {
    return text ? text.replace(/([^\\])(\$)([^\{])/g, '$1\\$2$3') : text;
}
function addFinalTabStop(text) {
    if (!text || !text.trim()) {
        return text;
    }
    let maxTabStop = -1;
    let maxTabStopRanges = [];
    let foundLastStop = false;
    let replaceWithLastStop = false;
    let i = 0;
    let n = text.length;
    try {
        while (i < n && !foundLastStop) {
            // Look for ${
            if (text[i++] != '$' || text[i++] != '{') {
                continue;
            }
            // Find tabstop
            let numberStart = -1;
            let numberEnd = -1;
            while (i < n && /\d/.test(text[i])) {
                numberStart = numberStart < 0 ? i : numberStart;
                numberEnd = i + 1;
                i++;
            }
            // If ${ was not followed by a number and either } or :, then its not a tabstop
            if (numberStart === -1 || numberEnd === -1 || i >= n || (text[i] != '}' && text[i] != ':')) {
                continue;
            }
            // If ${0} was found, then break
            const currentTabStop = text.substring(numberStart, numberEnd);
            foundLastStop = currentTabStop === '0';
            if (foundLastStop) {
                break;
            }
            let foundPlaceholder = false;
            if (text[i++] == ':') {
                // TODO: Nested placeholders may break here
                while (i < n) {
                    if (text[i] == '}') {
                        foundPlaceholder = true;
                        break;
                    }
                    i++;
                }
            }
            // Decide to replace currentTabStop with ${0} only if its the max among all tabstops and is not a placeholder
            if (Number(currentTabStop) > Number(maxTabStop)) {
                maxTabStop = currentTabStop;
                maxTabStopRanges = [{ numberStart, numberEnd }];
                replaceWithLastStop = !foundPlaceholder;
            }
            else if (currentTabStop == maxTabStop) {
                maxTabStopRanges.push({ numberStart, numberEnd });
            }
        }
    }
    catch (e) {
    }
    if (replaceWithLastStop && !foundLastStop) {
        for (let i = 0; i < maxTabStopRanges.length; i++) {
            let rangeStart = maxTabStopRanges[i].numberStart;
            let rangeEnd = maxTabStopRanges[i].numberEnd;
            text = text.substr(0, rangeStart) + '0' + text.substr(rangeEnd);
        }
    }
    return text;
}
function getCurrentLine(document, position) {
    let offset = document.offsetAt(position);
    let text = document.getText();
    let start = 0;
    let end = text.length;
    for (let i = offset - 1; i >= 0; i--) {
        if (text[i] === '\n') {
            start = i + 1;
            break;
        }
    }
    for (let i = offset; i < text.length; i++) {
        if (text[i] === '\n') {
            end = i;
            break;
        }
    }
    return text.substring(start, end);
}
let customSnippetRegistry = {};
let variablesFromFile = {};
let profilesFromFile = {};
exports.emmetSnippetField = (index, placeholder) => `\${${index}${placeholder ? ':' + placeholder : ''}}`;
function isStyleSheet(syntax) {
    let stylesheetSyntaxes = ['css', 'scss', 'sass', 'less', 'stylus'];
    return (stylesheetSyntaxes.indexOf(syntax) > -1);
}
exports.isStyleSheet = isStyleSheet;
function getFilters(text, pos) {
    let filter;
    for (let i = 0; i < maxFilters; i++) {
        if (text.endsWith(`${filterDelimitor}${bemFilterSuffix}`, pos)) {
            pos -= bemFilterSuffix.length + 1;
            filter = filter ? bemFilterSuffix + ',' + filter : bemFilterSuffix;
        }
        else if (text.endsWith(`${filterDelimitor}${commentFilterSuffix}`, pos)) {
            pos -= commentFilterSuffix.length + 1;
            filter = filter ? commentFilterSuffix + ',' + filter : commentFilterSuffix;
        }
        else if (text.endsWith(`${filterDelimitor}${trimFilterSuffix}`, pos)) {
            pos -= trimFilterSuffix.length + 1;
            filter = filter ? trimFilterSuffix + ',' + filter : trimFilterSuffix;
        }
        else {
            break;
        }
    }
    return {
        pos: pos,
        filter: filter
    };
}
/**
 *  * Extracts abbreviation from the given position in the given document
 * @param document The TextDocument from which abbreviation needs to be extracted
 * @param position The Position in the given document from where abbreviation needs to be extracted
 * @param options The options to pass to the @emmetio/extract-abbreviation module
 */
function extractAbbreviation(document, position, options) {
    const currentLine = getCurrentLine(document, position);
    const currentLineTillPosition = currentLine.substr(0, position.character);
    const { pos, filter } = getFilters(currentLineTillPosition, position.character);
    const lengthOccupiedByFilter = filter ? filter.length + 1 : 0;
    try {
        let extractOptions = options;
        if (typeof extractOptions !== 'boolean') {
            extractOptions = extractOptions || {};
            extractOptions = {
                syntax: (isStyleSheet(extractOptions.syntax) || extractOptions.syntax === 'stylesheet') ? 'stylesheet' : 'markup',
                lookAhead: extractOptions.lookAhead
            };
        }
        const result = extract(currentLine, pos, extractOptions);
        const rangeToReplace = vscode_languageserver_types_1.Range.create(position.line, result.location, position.line, result.location + result.abbreviation.length + lengthOccupiedByFilter);
        return {
            abbreviationRange: rangeToReplace,
            abbreviation: result.abbreviation,
            filter
        };
    }
    catch (e) {
    }
}
exports.extractAbbreviation = extractAbbreviation;
/**
 * Extracts abbreviation from the given text
 * @param text Text from which abbreviation needs to be extracted
 * @param syntax Syntax used to extract the abbreviation from the given text
 */
function extractAbbreviationFromText(text, syntax) {
    if (!text) {
        return;
    }
    const { pos, filter } = getFilters(text, text.length);
    try {
        let extractOptions = (isStyleSheet(syntax) || syntax === 'stylesheet') ? { syntax: 'stylesheet', lookAhead: false } : true;
        const result = extract(text, pos, extractOptions);
        return {
            abbreviation: result.abbreviation,
            filter
        };
    }
    catch (e) {
    }
}
exports.extractAbbreviationFromText = extractAbbreviationFromText;
/**
 * Returns a boolean denoting validity of given abbreviation in the context of given syntax
 * Not needed once https://github.com/emmetio/atom-plugin/issues/22 is fixed
 * @param syntax string
 * @param abbreviation string
 */
function isAbbreviationValid(syntax, abbreviation) {
    if (!abbreviation) {
        return false;
    }
    if (isStyleSheet(syntax)) {
        // Fix for https://github.com/Microsoft/vscode/issues/1623 in new emmet
        if (abbreviation.endsWith(':')) {
            return false;
        }
        if (abbreviation.indexOf('#') > -1) {
            return hexColorRegex.test(abbreviation) || propertyHexColorRegex.test(abbreviation);
        }
        return cssAbbreviationRegex.test(abbreviation);
    }
    if (abbreviation.startsWith('!')) {
        return !/[^!]/.test(abbreviation);
    }
    const multipleMatch = abbreviation.match(/\*(\d+)$/);
    if (multipleMatch) {
        return parseInt(multipleMatch[1], 10) <= 100;
    }
    // Its common for users to type (sometextinsidebrackets), this should not be treated as an abbreviation
    // Grouping in abbreviation is valid only if it's inside a text node or preceeded/succeeded with one of the symbols for nesting, sibling, repeater or climb up
    if ((/\(/.test(abbreviation) || /\)/.test(abbreviation)) && !/\{[^\}\{]*[\(\)]+[^\}\{]*\}(?:[>\+\*\^]|$)/.test(abbreviation) && !/\(.*\)[>\+\*\^]/.test(abbreviation) && !/[>\+\*\^]\(.*\)/.test(abbreviation)) {
        return false;
    }
    return (htmlAbbreviationStartRegex.test(abbreviation) && htmlAbbreviationRegex.test(abbreviation));
}
exports.isAbbreviationValid = isAbbreviationValid;
function isExpandedTextNoise(syntax, abbreviation, expandedText) {
    // Unresolved css abbreviations get expanded to a blank property value
    // Eg: abc -> abc: ; or abc:d -> abc: d; which is noise if it gets suggested for every word typed
    if (isStyleSheet(syntax)) {
        let after = (syntax === 'sass' || syntax === 'stylus') ? '' : ';';
        return expandedText === `${abbreviation}: \${1}${after}` || expandedText.replace(/\s/g, '') === abbreviation.replace(/\s/g, '') + after;
    }
    if (commonlyUsedTags.indexOf(abbreviation.toLowerCase()) > -1 || markupSnippetKeys.indexOf(abbreviation) > -1) {
        return false;
    }
    // Custom tags can have - or :
    if (/[-,:]/.test(abbreviation) && !/--|::/.test(abbreviation) && !abbreviation.endsWith(':')) {
        return false;
    }
    // Its common for users to type some text and end it with period, this should not be treated as an abbreviation
    // Else it becomes noise.
    // When user just types '.', return the expansion
    // Otherwise emmet loses change to participate later
    // For example in `.foo`. See https://github.com/Microsoft/vscode/issues/66013
    if (abbreviation === '.') {
        return false;
    }
    const dotMatches = abbreviation.match(/^([a-z,A-Z,\d]*)\.$/);
    if (dotMatches) {
        // Valid html tags such as `div.`
        if (dotMatches[1] && data_1.htmlData.tags.includes(dotMatches[1])) {
            return false;
        }
        return true;
    }
    // Unresolved html abbreviations get expanded as if it were a tag
    // Eg: abc -> <abc></abc> which is noise if it gets suggested for every word typed
    return (expandedText.toLowerCase() === `<${abbreviation.toLowerCase()}>\${1}</${abbreviation.toLowerCase()}>`);
}
/**
 * Returns options to be used by the @emmetio/expand-abbreviation module
 * @param syntax
 * @param textToReplace
 */
function getExpandOptions(syntax, emmetConfig, filter) {
    emmetConfig = emmetConfig || {};
    emmetConfig['preferences'] = emmetConfig['preferences'] || {};
    // Fetch snippet registry
    let baseSyntax = isStyleSheet(syntax) ? 'css' : 'html';
    if (!customSnippetRegistry[syntax] && customSnippetRegistry[baseSyntax]) {
        customSnippetRegistry[syntax] = customSnippetRegistry[baseSyntax];
    }
    // Fetch Profile
    let profile = getProfile(syntax, emmetConfig['syntaxProfiles']);
    let filtersFromProfile = (profile && profile['filters']) ? profile['filters'].split(',') : [];
    filtersFromProfile = filtersFromProfile.map(filterFromProfile => filterFromProfile.trim());
    // Update profile based on preferences
    if (emmetConfig['preferences']['format.noIndentTags']) {
        if (Array.isArray(emmetConfig['preferences']['format.noIndentTags'])) {
            profile['formatSkip'] = emmetConfig['preferences']['format.noIndentTags'];
        }
        else if (typeof emmetConfig['preferences']['format.noIndentTags'] === 'string') {
            profile['formatSkip'] = emmetConfig['preferences']['format.noIndentTags'].split(',');
        }
    }
    if (emmetConfig['preferences']['format.forceIndentationForTags']) {
        if (Array.isArray(emmetConfig['preferences']['format.forceIndentationForTags'])) {
            profile['formatForce'] = emmetConfig['preferences']['format.forceIndentationForTags'];
        }
        else if (typeof emmetConfig['preferences']['format.forceIndentationForTags'] === 'string') {
            profile['formatForce'] = emmetConfig['preferences']['format.forceIndentationForTags'].split(',');
        }
    }
    if (emmetConfig['preferences']['profile.allowCompactBoolean'] && typeof emmetConfig['preferences']['profile.allowCompactBoolean'] === 'boolean') {
        profile['compactBooleanAttributes'] = emmetConfig['preferences']['profile.allowCompactBoolean'];
    }
    // Fetch Add Ons
    let addons = {};
    if (filter && filter.split(',').find(x => x.trim() === 'bem') || filtersFromProfile.indexOf('bem') > -1) {
        addons['bem'] = { element: '__' };
        if (emmetConfig['preferences']['bem.elementSeparator']) {
            addons['bem']['element'] = emmetConfig['preferences']['bem.elementSeparator'];
        }
        if (emmetConfig['preferences']['bem.modifierSeparator']) {
            addons['bem']['modifier'] = emmetConfig['preferences']['bem.modifierSeparator'];
        }
    }
    if (syntax === 'jsx') {
        addons['jsx'] = true;
    }
    // Fetch Formatters
    let formatters = getFormatters(syntax, emmetConfig['preferences']);
    if (filter && filter.split(',').find(x => x.trim() === 'c') || filtersFromProfile.indexOf('c') > -1) {
        if (!formatters['comment']) {
            formatters['comment'] = {
                enabled: true
            };
        }
        else {
            formatters['comment']['enabled'] = true;
        }
    }
    // If the user doesn't provide specific properties for a vendor, use the default values
    let preferences = emmetConfig['preferences'];
    for (const v in vendorPrefixes) {
        let vendorProperties = preferences['css.' + vendorPrefixes[v] + 'Properties'];
        if (vendorProperties == null) {
            preferences['css.' + vendorPrefixes[v] + 'Properties'] = defaultVendorProperties[v];
        }
    }
    return {
        field: exports.emmetSnippetField,
        syntax: syntax,
        profile: profile,
        addons: addons,
        variables: getVariables(emmetConfig['variables']),
        snippets: customSnippetRegistry[syntax],
        format: formatters,
        preferences: preferences
    };
}
exports.getExpandOptions = getExpandOptions;
function splitVendorPrefix(abbreviation) {
    abbreviation = abbreviation || "";
    if (abbreviation[0] != '-') {
        return {
            prefixOptions: "",
            abbreviationWithoutPrefix: abbreviation
        };
    }
    else {
        abbreviation = abbreviation.substr(1);
        let pref = "-";
        if (/^[wmso]*-./.test(abbreviation)) {
            let index = abbreviation.indexOf("-");
            if (index > -1) {
                pref += abbreviation.substr(0, index + 1);
                abbreviation = abbreviation.substr(index + 1);
            }
        }
        return {
            prefixOptions: pref,
            abbreviationWithoutPrefix: abbreviation
        };
    }
}
function applyVendorPrefixes(expandedProperty, vendors, preferences) {
    preferences = preferences || {};
    expandedProperty = expandedProperty || "";
    vendors = vendors || "";
    if (vendors[0] !== '-') {
        return expandedProperty;
    }
    if (vendors == "-") {
        let defaultVendors = "-";
        let property = expandedProperty.substr(0, expandedProperty.indexOf(':'));
        if (!property) {
            return expandedProperty;
        }
        for (const v in vendorPrefixes) {
            let vendorProperties = preferences['css.' + vendorPrefixes[v] + 'Properties'];
            if (vendorProperties && vendorProperties.split(',').find(x => x.trim() === property))
                defaultVendors += v;
        }
        // If no vendors specified, add all
        vendors = defaultVendors == "-" ? "-wmso" : defaultVendors;
        vendors += '-';
    }
    vendors = vendors.substr(1);
    let prefixedProperty = "";
    for (let index = 0; index < vendors.length - 1; index++) {
        prefixedProperty += '-' + vendorPrefixes[vendors[index]] + '-' + expandedProperty + "\n";
    }
    return prefixedProperty + expandedProperty;
}
/**
 * Parses given abbreviation using given options and returns a tree
 * @param abbreviation string
 * @param options options used by the @emmetio/expand-abbreviation module to parse given abbreviation
 */
function parseAbbreviation(abbreviation, options) {
    return expand_full_1.parse(abbreviation, options);
}
exports.parseAbbreviation = parseAbbreviation;
/**
 * Expands given abbreviation using given options
 * @param abbreviation string or parsed abbreviation
 * @param options options used by the @emmetio/expand-abbreviation module to expand given abbreviation
 */
function expandAbbreviation(abbreviation, options) {
    let expandedText;
    let preferences = options['preferences'];
    delete options['preferences'];
    if (isStyleSheet(options['syntax']) && typeof abbreviation === 'string') {
        let { prefixOptions, abbreviationWithoutPrefix } = splitVendorPrefix(abbreviation);
        expandedText = expand_full_1.expand(abbreviationWithoutPrefix, options);
        expandedText = applyVendorPrefixes(expandedText, prefixOptions, preferences);
    }
    else {
        expandedText = expand_full_1.expand(abbreviation, options);
    }
    return escapeNonTabStopDollar(addFinalTabStop(expandedText));
}
exports.expandAbbreviation = expandAbbreviation;
/**
 * Maps and returns syntaxProfiles of previous format to ones compatible with new emmet modules
 * @param syntax
 */
function getProfile(syntax, profilesFromSettings) {
    if (!profilesFromSettings) {
        profilesFromSettings = {};
    }
    let profilesConfig = Object.assign({}, profilesFromFile, profilesFromSettings);
    let options = profilesConfig[syntax];
    if (!options || typeof options === 'string') {
        if (options === 'xhtml') {
            return {
                selfClosingStyle: 'xhtml'
            };
        }
        return {};
    }
    let newOptions = {};
    for (let key in options) {
        switch (key) {
            case 'tag_case':
                newOptions['tagCase'] = (options[key] === 'lower' || options[key] === 'upper') ? options[key] : '';
                break;
            case 'attr_case':
                newOptions['attributeCase'] = (options[key] === 'lower' || options[key] === 'upper') ? options[key] : '';
                break;
            case 'attr_quotes':
                newOptions['attributeQuotes'] = options[key];
                break;
            case 'tag_nl':
                newOptions['format'] = (options[key] === true || options[key] === false) ? options[key] : true;
                break;
            case 'inline_break':
                newOptions['inlineBreak'] = options[key];
                break;
            case 'self_closing_tag':
                if (options[key] === true) {
                    newOptions['selfClosingStyle'] = 'xml';
                    break;
                }
                if (options[key] === false) {
                    newOptions['selfClosingStyle'] = 'html';
                    break;
                }
                newOptions['selfClosingStyle'] = options[key];
                break;
            case 'compact_bool':
                newOptions['compactBooleanAttributes'] = options[key];
                break;
            default:
                newOptions[key] = options[key];
                break;
        }
    }
    return newOptions;
}
/**
 * Returns variables to be used while expanding snippets
 */
function getVariables(variablesFromSettings) {
    if (!variablesFromSettings) {
        return variablesFromFile;
    }
    return Object.assign({}, variablesFromFile, variablesFromSettings);
}
function getFormatters(syntax, preferences) {
    if (!preferences) {
        return {};
    }
    if (!isStyleSheet(syntax)) {
        let commentFormatter = {};
        for (let key in preferences) {
            switch (key) {
                case 'filter.commentAfter':
                    commentFormatter['after'] = preferences[key];
                    break;
                case 'filter.commentBefore':
                    commentFormatter['before'] = preferences[key];
                    break;
                case 'filter.commentTrigger':
                    commentFormatter['trigger'] = preferences[key];
                    break;
                default:
                    break;
            }
        }
        return {
            comment: commentFormatter
        };
    }
    let fuzzySearchMinScore = typeof preferences['css.fuzzySearchMinScore'] === 'number' ? preferences['css.fuzzySearchMinScore'] : 0.3;
    if (fuzzySearchMinScore > 1) {
        fuzzySearchMinScore = 1;
    }
    else if (fuzzySearchMinScore < 0) {
        fuzzySearchMinScore = 0;
    }
    let stylesheetFormatter = {
        'fuzzySearchMinScore': fuzzySearchMinScore
    };
    for (let key in preferences) {
        switch (key) {
            case 'css.floatUnit':
                stylesheetFormatter['floatUnit'] = preferences[key];
                break;
            case 'css.intUnit':
                stylesheetFormatter['intUnit'] = preferences[key];
                break;
            case 'css.unitAliases':
                let unitAliases = {};
                preferences[key].split(',').forEach(alias => {
                    if (!alias || !alias.trim() || alias.indexOf(':') === -1) {
                        return;
                    }
                    let aliasName = alias.substr(0, alias.indexOf(':'));
                    let aliasValue = alias.substr(aliasName.length + 1);
                    if (!aliasName.trim() || !aliasValue) {
                        return;
                    }
                    unitAliases[aliasName.trim()] = aliasValue;
                });
                stylesheetFormatter['unitAliases'] = unitAliases;
                break;
            case `${syntax}.valueSeparator`:
                stylesheetFormatter['between'] = preferences[key];
                break;
            case `${syntax}.propertyEnd`:
                stylesheetFormatter['after'] = preferences[key];
                break;
            default:
                break;
        }
    }
    return {
        stylesheet: stylesheetFormatter
    };
}
/**
 * Updates customizations from snippets.json and syntaxProfiles.json files in the directory configured in emmet.extensionsPath setting
 */
function updateExtensionsPath(emmetExtensionsPath, workspaceFolderPath) {
    if (!emmetExtensionsPath || !emmetExtensionsPath.trim()) {
        resetSettingsFromFile();
        return Promise.resolve();
    }
    emmetExtensionsPath = emmetExtensionsPath.trim();
    workspaceFolderPath = workspaceFolderPath ? workspaceFolderPath.trim() : '';
    if (emmetExtensionsPath[0] === '~') {
        emmetExtensionsPath = path.join(os_1.homedir(), emmetExtensionsPath.substr(1));
    }
    else if (!path.isAbsolute(emmetExtensionsPath) && workspaceFolderPath) {
        emmetExtensionsPath = path.join(workspaceFolderPath, emmetExtensionsPath);
    }
    if (!path.isAbsolute(emmetExtensionsPath)) {
        resetSettingsFromFile();
        return Promise.reject('The path provided in emmet.extensionsPath setting should be absoulte path');
    }
    if (!dirExists(emmetExtensionsPath)) {
        resetSettingsFromFile();
        return Promise.reject(`The directory ${emmetExtensionsPath} doesnt exist. Update emmet.extensionsPath setting`);
    }
    let dirPath = emmetExtensionsPath;
    let snippetsPath = path.join(dirPath, 'snippets.json');
    let profilesPath = path.join(dirPath, 'syntaxProfiles.json');
    let snippetsPromise = new Promise((resolve, reject) => {
        fs.readFile(snippetsPath, (err, snippetsData) => {
            if (err) {
                return reject(`Error while fetching the file ${snippetsPath}`);
            }
            try {
                let errors = [];
                let snippetsJson = JSONC.parse(snippetsData.toString(), errors);
                if (errors.length > 0) {
                    return reject(`Found error ${JSONC.ScanError[errors[0].error]} while parsing the file ${snippetsPath} at offset ${errors[0].offset}`);
                }
                variablesFromFile = snippetsJson['variables'];
                customSnippetRegistry = {};
                snippetKeyCache.clear();
                Object.keys(snippetsJson).forEach(syntax => {
                    if (!snippetsJson[syntax]['snippets']) {
                        return;
                    }
                    let baseSyntax = isStyleSheet(syntax) ? 'css' : 'html';
                    let customSnippets = snippetsJson[syntax]['snippets'];
                    if (snippetsJson[baseSyntax] && snippetsJson[baseSyntax]['snippets'] && baseSyntax !== syntax) {
                        customSnippets = Object.assign({}, snippetsJson[baseSyntax]['snippets'], snippetsJson[syntax]['snippets']);
                    }
                    if (!isStyleSheet(syntax)) {
                        // In Emmet 2.0 all snippets should be valid abbreviations
                        // Convert old snippets that do not follow this format to new format
                        for (let snippetKey in customSnippets) {
                            if (customSnippets.hasOwnProperty(snippetKey)
                                && customSnippets[snippetKey].startsWith('<')
                                && customSnippets[snippetKey].endsWith('>')) {
                                customSnippets[snippetKey] = `{${customSnippets[snippetKey]}}`;
                            }
                        }
                    }
                    else {
                        stylesheetCustomSnippetsKeyCache.set(syntax, Object.keys(customSnippets));
                    }
                    customSnippetRegistry[syntax] = expand_full_1.createSnippetsRegistry(syntax, customSnippets);
                    let snippetKeys = customSnippetRegistry[syntax].all({ type: 'string' }).map(snippet => {
                        return snippet.key;
                    });
                    snippetKeyCache.set(syntax, snippetKeys);
                });
            }
            catch (e) {
                return reject(`Error while parsing the file ${snippetsPath}`);
            }
            return resolve();
        });
    });
    let variablesPromise = new Promise((resolve, reject) => {
        fs.readFile(profilesPath, (err, profilesData) => {
            try {
                if (!err) {
                    profilesFromFile = JSON.parse(profilesData.toString());
                }
            }
            catch (e) {
            }
            return resolve();
        });
    });
    return Promise.all([snippetsPromise, variablesFromFile]).then(() => Promise.resolve());
}
exports.updateExtensionsPath = updateExtensionsPath;
function dirExists(dirPath) {
    try {
        return fs.statSync(dirPath).isDirectory();
    }
    catch (e) {
        return false;
    }
}
function resetSettingsFromFile() {
    customSnippetRegistry = {};
    snippetKeyCache.clear();
    stylesheetCustomSnippetsKeyCache.clear();
    profilesFromFile = {};
    variablesFromFile = {};
}
/**
* Get the corresponding emmet mode for given vscode language mode
* Eg: jsx for typescriptreact/javascriptreact or pug for jade
* If the language is not supported by emmet or has been exlcuded via `exlcudeLanguages` setting,
* then nothing is returned
*
* @param language
* @param exlcudedLanguages Array of language ids that user has chosen to exlcude for emmet
*/
function getEmmetMode(language, excludedLanguages = []) {
    if (!language || excludedLanguages.indexOf(language) > -1) {
        return;
    }
    if (/\b(typescriptreact|javascriptreact|jsx-tags)\b/.test(language)) { // treat tsx like jsx
        return 'jsx';
    }
    if (language === 'sass-indented') { // map sass-indented to sass
        return 'sass';
    }
    if (language === 'jade') {
        return 'pug';
    }
    if (emmetModes.indexOf(language) > -1) {
        return language;
    }
}
exports.getEmmetMode = getEmmetMode;
const propertyHexColorRegex = /^[a-zA-Z]+:?#[\d.a-fA-F]{0,6}$/;
const hexColorRegex = /^#[\d,a-f,A-F]{1,6}$/;
const onlyLetters = /^[a-z,A-Z]+$/;
/**
 * Returns a completion participant for Emmet of the form {
 * 		onCssProperty: () => void
 * 		onCssPropertyValue: () => void
 * 		onHtmlContent: () => void
 * }
 * @param document The TextDocument for which completions are being provided
 * @param position The Position in the given document where completions are being provided
 * @param syntax The Emmet syntax to use when providing Emmet completions
 * @param emmetSettings The Emmet settings to use when providing Emmet completions
 * @param result The Completion List object that needs to be updated with Emmet completions
 */
function getEmmetCompletionParticipants(document, position, syntax, emmetSettings, result) {
    return {
        getId: () => 'emmet',
        onCssProperty: (context) => {
            if (context && context.propertyName) {
                const currentresult = doComplete(document, position, syntax, emmetSettings);
                if (result && currentresult) {
                    result.items = currentresult.items;
                    result.isIncomplete = true;
                }
            }
        },
        onCssPropertyValue: (context) => {
            if (context && context.propertyValue) {
                const extractedResults = extractAbbreviation(document, position, { syntax: 'css', lookAhead: false });
                if (!extractedResults) {
                    return;
                }
                const validAbbreviationWithColon = extractedResults.abbreviation === `${context.propertyName}:${context.propertyValue}` && onlyLetters.test(context.propertyValue);
                if (validAbbreviationWithColon // Allows abbreviations like pos:f
                    || hexColorRegex.test(extractedResults.abbreviation)
                    || extractedResults.abbreviation === '!') {
                    const currentresult = doComplete(document, position, syntax, emmetSettings);
                    if (result && currentresult) {
                        result.items = currentresult.items;
                        result.isIncomplete = true;
                    }
                }
            }
        },
        onHtmlContent: () => {
            const currentresult = doComplete(document, position, syntax, emmetSettings);
            if (result && currentresult) {
                result.items = currentresult.items;
                result.isIncomplete = true;
            }
        }
    };
}
exports.getEmmetCompletionParticipants = getEmmetCompletionParticipants;
//# sourceMappingURL=emmetHelper.js.map