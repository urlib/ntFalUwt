"use strict";
/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Converts a local path from Code to a path on the target.
 */
class BasePathTransformer {
    launch(args) {
        return Promise.resolve();
    }
    attach(args) {
        return Promise.resolve();
    }
    setBreakpoints(source) {
        return source;
    }
    clearTargetContext() {
    }
    scriptParsed(scriptPath) {
        return Promise.resolve(scriptPath);
    }
    breakpointResolved(bp, targetPath) {
        return this.getClientPathFromTargetPath(targetPath) || targetPath;
    }
    stackTraceResponse(response) {
    }
    fixSource(source) {
        return __awaiter(this, void 0, void 0, function* () {
        });
    }
    getTargetPathFromClientPath(clientPath) {
        return clientPath;
    }
    getClientPathFromTargetPath(targetPath) {
        return targetPath;
    }
}
exports.BasePathTransformer = BasePathTransformer;

//# sourceMappingURL=basePathTransformer.js.map
