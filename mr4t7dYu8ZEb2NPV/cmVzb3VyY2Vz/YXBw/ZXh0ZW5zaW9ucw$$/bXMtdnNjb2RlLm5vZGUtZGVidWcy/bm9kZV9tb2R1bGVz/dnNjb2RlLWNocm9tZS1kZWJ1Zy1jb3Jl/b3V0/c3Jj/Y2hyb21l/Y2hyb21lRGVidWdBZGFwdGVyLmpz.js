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
const vscode_debugadapter_1 = require("vscode-debugadapter");
const chromeConnection_1 = require("./chromeConnection");
const ChromeUtils = require("./chromeUtils");
const variables_1 = require("./variables");
const variables = require("./variables");
const consoleHelper_1 = require("./consoleHelper");
const stoppedEvent_1 = require("./stoppedEvent");
const internalSourceBreakpoint_1 = require("./internalSourceBreakpoint");
const errors = require("../errors");
const utils = require("../utils");
const utils_1 = require("../utils");
const telemetry_1 = require("../telemetry");
const executionTimingsReporter_1 = require("../executionTimingsReporter");
const lineNumberTransformer_1 = require("../transformers/lineNumberTransformer");
const remotePathTransformer_1 = require("../transformers/remotePathTransformer");
const eagerSourceMapTransformer_1 = require("../transformers/eagerSourceMapTransformer");
const fallbackToClientPathTransformer_1 = require("../transformers/fallbackToClientPathTransformer");
const breakOnLoadHelper_1 = require("./breakOnLoadHelper");
const sourceMapUtils = require("../sourceMaps/sourceMapUtils");
const path = require("path");
const nls = require("vscode-nls");
const remoteMapper_1 = require("../remoteMapper");
const breakpoints_1 = require("./breakpoints");
const variablesManager_1 = require("./variablesManager");
const stackFrames_1 = require("./stackFrames");
const scripts_1 = require("./scripts");
const smartStep_1 = require("./smartStep");
const scriptSkipping_1 = require("./scriptSkipping");
let localize = nls.loadMessageBundle(__filename);
class ChromeDebugAdapter {
    constructor({ chromeConnection, lineColTransformer, sourceMapTransformer, pathTransformer, targetFilter, breakpoints, scriptContainer }, session) {
        this._domains = new Map();
        this._waitAfterStep = Promise.resolve();
        this._currentStep = Promise.resolve();
        this._currentLogMessage = Promise.resolve();
        this._pauseOnPromiseRejections = true;
        this._promiseRejectExceptionFilterEnabled = false;
        this._smartStepCount = 0;
        this._earlyScripts = [];
        this._initialSourceMapsP = Promise.resolve();
        // Queue to synchronize new source loaded and source removed events so that 'remove' script events
        // won't be send before the corresponding 'new' event has been sent
        this._sourceLoadedQueue = Promise.resolve(null);
        // Promises so ScriptPaused events can wait for ScriptParsed events to finish resolving breakpoints
        this._scriptIdToBreakpointsAreResolvedDefer = new Map();
        this._loadedSourcesByScriptId = new Map();
        telemetry_1.telemetry.setupEventHandler(e => session.sendEvent(e));
        this._batchTelemetryReporter = new telemetry_1.BatchTelemetryReporter(telemetry_1.telemetry);
        this._session = session;
        this._chromeConnection = new (chromeConnection || chromeConnection_1.ChromeConnection)(undefined, targetFilter);
        this.events = new executionTimingsReporter_1.StepProgressEventsEmitter(this._chromeConnection.events ? [this._chromeConnection.events] : []);
        this._scriptContainer = new (scriptContainer || scripts_1.ScriptContainer)();
        this._transformers = {
            lineColTransformer: new (lineColTransformer || lineNumberTransformer_1.LineColTransformer)(this._session),
            sourceMapTransformer: new (sourceMapTransformer || eagerSourceMapTransformer_1.EagerSourceMapTransformer)(this._scriptContainer),
            pathTransformer: new (pathTransformer || remotePathTransformer_1.RemotePathTransformer)()
        };
        this._breakpoints = new (breakpoints || breakpoints_1.Breakpoints)(this, this._chromeConnection);
        this._variablesManager = new variablesManager_1.VariablesManager(this._chromeConnection);
        this._stackFrames = new stackFrames_1.StackFrames();
        this._scriptSkipper = new scriptSkipping_1.ScriptSkipper(this._chromeConnection, this._transformers);
        this.clearTargetContext();
    }
    get columnBreakpointsEnabled() { return this._columnBreakpointsEnabled; }
    get breakOnLoadHelper() { return this._breakOnLoadHelper; }
    get chrome() {
        return this._chromeConnection.api;
    }
    /**
     * @deprecated
     */
    get scriptsById() {
        return this._scriptContainer.scriptsByIdMap;
    }
    get committedBreakpointsByUrl() {
        return this._breakpoints.committedBreakpointsByUrl;
    }
    get pathTransformer() { return this._transformers.pathTransformer; }
    get sourceMapTransformer() { return this._transformers.sourceMapTransformer; }
    get lineColTransformer() { return this._transformers.lineColTransformer; }
    get session() { return this._session; }
    get originProvider() { return (url) => this.getReadonlyOrigin(url); }
    /**
     * Called on 'clearEverything' or on a navigation/refresh
     */
    clearTargetContext() {
        this.sourceMapTransformer.clearTargetContext();
        this._scriptContainer.reset();
        if (this._breakpoints) {
            this._breakpoints.reset();
        }
        this.pathTransformer.clearTargetContext();
    }
    /* __GDPR__
        "ClientRequest/initialize" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    initialize(args) {
        if (args.supportsMapURLToFilePathRequest) {
            this._transformers.pathTransformer = new fallbackToClientPathTransformer_1.FallbackToClientPathTransformer(this._session);
        }
        this._isVSClient = args.clientID === 'visualstudio';
        utils.setCaseSensitivePaths(!this._isVSClient);
        this.sourceMapTransformer.isVSClient = this._isVSClient;
        if (args.pathFormat !== 'path') {
            throw errors.pathFormat();
        }
        if (args.locale) {
            localize = nls.config({ locale: args.locale })(__filename);
        }
        // because session bypasses dispatchRequest
        if (typeof args.linesStartAt1 === 'boolean') {
            this._clientLinesStartAt1 = args.linesStartAt1;
        }
        if (typeof args.columnsStartAt1 === 'boolean') {
            this._clientColumnsStartAt1 = args.columnsStartAt1;
        }
        const exceptionBreakpointFilters = [
            {
                label: localize(0, null),
                filter: 'all',
                default: false
            },
            {
                label: localize(1, null),
                filter: 'uncaught',
                default: false
            }
        ];
        if (this._promiseRejectExceptionFilterEnabled) {
            exceptionBreakpointFilters.push({
                label: localize(2, null),
                filter: 'promise_reject',
                default: false
            });
        }
        // This debug adapter supports two exception breakpoint filters
        return {
            exceptionBreakpointFilters,
            supportsConfigurationDoneRequest: true,
            supportsSetVariable: true,
            supportsConditionalBreakpoints: true,
            supportsCompletionsRequest: true,
            supportsHitConditionalBreakpoints: true,
            supportsRestartFrame: true,
            supportsExceptionInfoRequest: true,
            supportsDelayedStackTraceLoading: true,
            supportsValueFormattingOptions: true,
            supportsEvaluateForHovers: true,
            supportsLoadedSourcesRequest: true,
            supportsBreakpointLocationsRequest: false
        };
    }
    /* __GDPR__
        "ClientRequest/configurationDone" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    configurationDone() {
        return Promise.resolve();
    }
    get breakOnLoadActive() {
        return !!this._breakOnLoadHelper;
    }
    /* __GDPR__
        "ClientRequest/launch" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    launch(args, telemetryPropertyCollector) {
        return __awaiter(this, void 0, void 0, function* () {
            this.commonArgs(args);
            if (args.pathMapping) {
                for (const urlToMap in args.pathMapping) {
                    args.pathMapping[urlToMap] = utils.canonicalizeUrl(args.pathMapping[urlToMap]);
                }
            }
            this.sourceMapTransformer.launch(args);
            yield this.pathTransformer.launch(args);
            if (!args.__restart) {
                /* __GDPR__
                   "debugStarted" : {
                      "request" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                      "args" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                      "${include}": [ "${DebugCommonProperties}" ]
                   }
                */
                telemetry_1.telemetry.reportEvent('debugStarted', { request: 'launch', args: Object.keys(args) });
            }
        });
    }
    /* __GDPR__
        "ClientRequest/attach" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    attach(args) {
        return __awaiter(this, void 0, void 0, function* () {
            this._attachMode = true;
            this.commonArgs(args);
            this.sourceMapTransformer.attach(args);
            yield this.pathTransformer.attach(args);
            if (!args.port) {
                args.port = 9229;
            }
            /* __GDPR__
                "debugStarted" : {
                    "request" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                    "args" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                    "${include}": [ "${DebugCommonProperties}" ]
                }
            */
            telemetry_1.telemetry.reportEvent('debugStarted', { request: 'attach', args: Object.keys(args) });
            yield this.doAttach(args.port, args.url, args.address, args.timeout, args.websocketUrl, args.extraCRDPChannelPort);
        });
    }
    commonArgs(args) {
        let logToFile = false;
        let logLevel;
        if (args.trace === 'verbose') {
            logLevel = vscode_debugadapter_1.Logger.LogLevel.Verbose;
            logToFile = true;
        }
        else if (args.trace) {
            logLevel = vscode_debugadapter_1.Logger.LogLevel.Warn;
            logToFile = true;
        }
        else {
            logLevel = vscode_debugadapter_1.Logger.LogLevel.Warn;
        }
        let logTimestamps = args.logTimestamps;
        // The debug configuration provider should have set logFilePath on the launch config. If not, default to 'true' to use the
        // "legacy" log file path from the CDA subclass
        const logFilePath = args.logFilePath || logToFile;
        vscode_debugadapter_1.logger.setup(logLevel, logFilePath, logTimestamps);
        this._launchAttachArgs = args;
        // Enable sourcemaps and async callstacks by default
        args.sourceMaps = typeof args.sourceMaps === 'undefined' || args.sourceMaps;
        args.showAsyncStacks = typeof args.showAsyncStacks === 'undefined' || args.showAsyncStacks;
        this._smartStepper = new smartStep_1.SmartStepper(this._launchAttachArgs.smartStep);
        if (args.breakOnLoadStrategy && args.breakOnLoadStrategy !== 'off') {
            this._breakOnLoadHelper = new breakOnLoadHelper_1.BreakOnLoadHelper(this, args.breakOnLoadStrategy);
        }
        // Use hasOwnProperty to explicitly permit setting a falsy targetFilter.
        if (args.hasOwnProperty('targetFilter')) {
            this._chromeConnection.setTargetFilter(args.targetFilter);
        }
    }
    shutdown() {
        this._batchTelemetryReporter.finalize();
        this._inShutdown = true;
        this._session.shutdown();
    }
    terminateSession(reason, _disconnectArgs, restart) {
        return __awaiter(this, void 0, void 0, function* () {
            vscode_debugadapter_1.logger.log(`Terminated: ${reason}`);
            if (!this._hasTerminated) {
                vscode_debugadapter_1.logger.log(`Waiting for any pending steps or log messages.`);
                yield this._currentStep;
                yield this._currentLogMessage;
                vscode_debugadapter_1.logger.log(`Current step and log messages complete`);
                /* __GDPR__
                   "debugStopped" : {
                      "reason" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                      "${include}": [ "${DebugCommonProperties}" ]
                   }
                 */
                telemetry_1.telemetry.reportEvent('debugStopped', { reason });
                this._hasTerminated = true;
                if (this._clientAttached || (this._launchAttachArgs && this._launchAttachArgs.noDebug)) {
                    this._session.sendEvent(new vscode_debugadapter_1.TerminatedEvent(restart));
                }
                if (this._chromeConnection.isAttached) {
                    this._chromeConnection.close();
                }
            }
        });
    }
    /**
     * Hook up all connection events
     */
    hookConnectionEvents() {
        this.chrome.Debugger.on('paused', params => {
            /* __GDPR__
               "target/notification/onPaused" : {
                  "${include}": [
                      "${IExecutionResultTelemetryProperties}",
                      "${DebugCommonProperties}"
                    ]
               }
             */
            this.runAndMeasureProcessingTime('target/notification/onPaused', () => __awaiter(this, void 0, void 0, function* () {
                yield this.onPaused(params);
            }));
        });
        this.chrome.Debugger.on('resumed', () => this.onResumed());
        this.chrome.Debugger.on('scriptParsed', params => {
            /* __GDPR__
               "target/notification/onScriptParsed" : {
                  "${include}": [
                        "${IExecutionResultTelemetryProperties}",
                        "${DebugCommonProperties}"
                    ]
               }
             */
            this.runAndMeasureProcessingTime('target/notification/onScriptParsed', () => {
                return this.onScriptParsed(params);
            });
        });
        this.chrome.Console.on('messageAdded', params => this.onMessageAdded(params));
        this.chrome.Runtime.on('consoleAPICalled', params => this.onConsoleAPICalled(params));
        this.chrome.Runtime.on('exceptionThrown', params => this.onExceptionThrown(params));
        this.chrome.Runtime.on('executionContextsCleared', () => this.onExecutionContextsCleared());
        this.chrome.Log.on('entryAdded', params => this.onLogEntryAdded(params));
        this.chrome.Debugger.on('breakpointResolved', params => this._breakpoints.onBreakpointResolved(params, this._scriptContainer));
        this._chromeConnection.onClose(() => this.terminateSession('websocket closed'));
    }
    runAndMeasureProcessingTime(notificationName, procedure) {
        return __awaiter(this, void 0, void 0, function* () {
            const startTime = Date.now();
            const startTimeMark = process.hrtime();
            let properties = {
                startTime: startTime.toString()
            };
            try {
                yield procedure();
                properties.successful = 'true';
            }
            catch (e) {
                properties.successful = 'false';
                properties.exceptionType = 'firstChance';
                utils.fillErrorDetails(properties, e);
            }
            const elapsedTime = utils.calculateElapsedTime(startTimeMark);
            properties.timeTakenInMilliseconds = elapsedTime.toString();
            // Callers set GDPR annotation
            this._batchTelemetryReporter.reportEvent(notificationName, properties);
        });
    }
    /**
     * Enable clients and run connection
     */
    runConnection() {
        return [
            this.chrome.Console.enable()
                .catch(() => { }),
            utils.toVoidP(this.chrome.Debugger.enable()),
            this.chrome.Runtime.enable(),
            this.chrome.Log.enable()
                .catch(() => { }),
            this._chromeConnection.run(),
        ];
    }
    doAttach(port, targetUrl, address, timeout, websocketUrl, extraCRDPChannelPort) {
        return __awaiter(this, void 0, void 0, function* () {
            /* __GDPR__FRAGMENT__
               "StepNames" : {
                  "Attach" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
               }
             */
            this.events.emitStepStarted('Attach');
            // Client is attaching - if not attached to the chrome target, create a connection and attach
            this._clientAttached = true;
            if (!this._chromeConnection.isAttached) {
                if (websocketUrl) {
                    yield this._chromeConnection.attachToWebsocketUrl(websocketUrl, extraCRDPChannelPort);
                }
                else {
                    yield this._chromeConnection.attach(address, port, targetUrl, timeout, extraCRDPChannelPort);
                }
                /* __GDPR__FRAGMENT__
                "StepNames" : {
                    "Attach.ConfigureDebuggingSession.Internal" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
                }
                */
                this.events.emitStepStarted('Attach.ConfigureDebuggingSession.Internal');
                this._port = port;
                this.hookConnectionEvents();
                /* __GDPR__FRAGMENT__
                   "StepNames" : {
                      "Attach.ConfigureDebuggingSession.Target" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
                   }
                 */
                this.events.emitStepStarted('Attach.ConfigureDebuggingSession.Target');
                // Make sure debugging domain is enabled before initializing the script skipper
                yield Promise.all(this.runConnection());
                this._scriptSkipper.init(this._launchAttachArgs.skipFiles, this._launchAttachArgs.skipFileRegExps);
                yield this.initSupportedDomains();
                const maxDepth = this._launchAttachArgs.showAsyncStacks ? ChromeDebugAdapter.ASYNC_CALL_STACK_DEPTH : 0;
                try {
                    yield this.chrome.Debugger.setAsyncCallStackDepth({ maxDepth });
                }
                catch (e) {
                    // Not supported by older runtimes, ignore it.
                }
                if (this._breakOnLoadHelper) {
                    this._breakOnLoadHelper.setBrowserVersion((yield this._chromeConnection.version).browser);
                }
                /* __GDPR__FRAGMENT__
                   "StepNames" : {
                      "Attach.ConfigureDebuggingSession.End" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
                   }
                 */
                this.events.emitStepStarted('Attach.ConfigureDebuggingSession.End');
            }
        });
    }
    initSupportedDomains() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const domainResponse = yield this.chrome.Schema.getDomains();
                domainResponse.domains.forEach(domain => this._domains.set(domain.name, domain));
            }
            catch (e) {
                // If getDomains isn't supported for some reason, skip this
            }
        });
    }
    /**
     * This event tells the client to begin sending setBP requests, etc. Some consumers need to override this
     * to send it at a later time of their choosing.
     */
    sendInitializedEvent() {
        return __awaiter(this, void 0, void 0, function* () {
            // Wait to finish loading sourcemaps from the initial scriptParsed events
            if (this._initialSourceMapsP) {
                const initialSourceMapsP = this._initialSourceMapsP;
                this._initialSourceMapsP = null;
                yield initialSourceMapsP;
                this._session.sendEvent(new vscode_debugadapter_1.InitializedEvent());
                this.events.emitStepCompleted('NotifyInitialized');
                yield Promise.all(this._earlyScripts.map(script => this.sendLoadedSourceEvent(script)));
                this._earlyScripts = null;
            }
        });
    }
    doAfterProcessingSourceEvents(action) {
        return this._sourceLoadedQueue = this._sourceLoadedQueue.then(action);
    }
    /**
     * e.g. the target navigated
     */
    onExecutionContextsCleared() {
        const cachedScriptParsedEvents = Array.from(this._scriptContainer.loadedScripts);
        this.clearTargetContext();
        return this.doAfterProcessingSourceEvents(() => __awaiter(this, void 0, void 0, function* () {
            for (let scriptedParseEvent of cachedScriptParsedEvents) {
                this.sendLoadedSourceEvent(scriptedParseEvent, 'removed');
            }
        }));
    }
    onPaused(notification, expectingStopReason = this._expectingStopReason) {
        return __awaiter(this, void 0, void 0, function* () {
            if (notification.asyncCallStackTraceId) {
                yield this.chrome.Debugger.pauseOnAsyncCall({ parentStackTraceId: notification.asyncCallStackTraceId });
                yield this.chrome.Debugger.resume();
                return { didPause: false };
            }
            this._variablesManager.onPaused();
            this._stackFrames.reset();
            this._exception = undefined;
            this._lastPauseState = { event: notification, expecting: expectingStopReason };
            this._currentPauseNotification = notification;
            // If break on load is active, we pass the notification object to breakonload helper
            // If it returns true, we continue and return
            if (this.breakOnLoadActive) {
                let shouldContinue = yield this._breakOnLoadHelper.handleOnPaused(notification);
                if (shouldContinue) {
                    this.chrome.Debugger.resume()
                        .catch(e => {
                        vscode_debugadapter_1.logger.error('Failed to resume due to exception: ' + e.message);
                    });
                    return { didPause: false };
                }
            }
            // We can tell when we've broken on an exception. Otherwise if hitBreakpoints is set, assume we hit a
            // breakpoint. If not set, assume it was a step. We can't tell the difference between step and 'break on anything'.
            let reason;
            let shouldSmartStep = false;
            if (notification.reason === 'exception') {
                reason = 'exception';
                this._exception = notification.data;
            }
            else if (notification.reason === 'promiseRejection') {
                reason = 'promise_rejection';
                // After processing smartStep and so on, check whether we are paused on a promise rejection, and should continue past it
                if (this._promiseRejectExceptionFilterEnabled && !this._pauseOnPromiseRejections) {
                    this.chrome.Debugger.resume()
                        .catch(() => { });
                    return { didPause: false };
                }
                this._exception = notification.data;
            }
            else if (notification.hitBreakpoints && notification.hitBreakpoints.length) {
                reason = 'breakpoint';
                const result = this._breakpoints.handleHitCountBreakpoints(expectingStopReason, notification.hitBreakpoints);
                if (result) {
                    return result;
                }
            }
            else if (expectingStopReason) {
                // If this was a step, check whether to smart step
                reason = expectingStopReason;
                shouldSmartStep = yield this._shouldSmartStepCallFrame(this._currentPauseNotification.callFrames[0]);
            }
            else {
                reason = 'debugger_statement';
            }
            this._expectingStopReason = undefined;
            if (shouldSmartStep) {
                this._smartStepCount++;
                yield this.stepIn(false);
                return { didPause: false };
            }
            else {
                if (this._smartStepCount > 0) {
                    vscode_debugadapter_1.logger.log(`SmartStep: Skipped ${this._smartStepCount} steps`);
                    this._smartStepCount = 0;
                }
                // Enforce that the stopped event is not fired until we've sent the response to the step that induced it.
                // Also with a timeout just to ensure things keep moving
                const sendStoppedEvent = () => {
                    return this._session.sendEvent(new stoppedEvent_1.StoppedEvent2(reason, /*threadId=*/ ChromeDebugAdapter.THREAD_ID, this._exception));
                };
                yield utils.promiseTimeout(this._currentStep, /*timeoutMs=*/ 300)
                    .then(sendStoppedEvent, sendStoppedEvent);
                return { didPause: true };
            }
        });
    }
    /* __GDPR__
        "ClientRequest/exceptionInfo" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    exceptionInfo(args) {
        return __awaiter(this, void 0, void 0, function* () {
            if (args.threadId !== ChromeDebugAdapter.THREAD_ID) {
                throw errors.invalidThread(args.threadId);
            }
            if (this._exception) {
                const isError = this._exception.subtype === 'error';
                const message = isError ? utils.firstLine(this._exception.description) : (this._exception.description || this._exception.value);
                const formattedMessage = message && message.replace(/\*/g, '\\*');
                const response = {
                    exceptionId: this._exception.className || this._exception.type || 'Error',
                    breakMode: 'unhandled',
                    details: {
                        stackTrace: this._exception.description && (yield this._stackFrames.mapFormattedException(this._exception.description, this._transformers)),
                        message,
                        formattedDescription: formattedMessage,
                        typeName: this._exception.subtype || this._exception.type
                    }
                };
                return response;
            }
            else {
                throw errors.noStoredException();
            }
        });
    }
    onResumed() {
        this._currentPauseNotification = null;
        if (this._expectingResumedEvent) {
            this._expectingResumedEvent = false;
            // Need to wait to eval just a little after each step, because of #148
            this._waitAfterStep = utils.promiseTimeout(null, 50);
        }
        else {
            let resumedEvent = new vscode_debugadapter_1.ContinuedEvent(ChromeDebugAdapter.THREAD_ID);
            this._session.sendEvent(resumedEvent);
        }
    }
    detectColumnBreakpointSupport(scriptId) {
        return __awaiter(this, void 0, void 0, function* () {
            this._columnBreakpointsEnabled = false; // So it isn't requested multiple times
            try {
                yield this.chrome.Debugger.getPossibleBreakpoints({
                    start: { scriptId, lineNumber: 0, columnNumber: 0 },
                    end: { scriptId, lineNumber: 1, columnNumber: 0 },
                    restrictToFunction: false
                });
                this._columnBreakpointsEnabled = true;
            }
            catch (e) {
                this._columnBreakpointsEnabled = false;
            }
            this.lineColTransformer.columnBreakpointsEnabled = this._columnBreakpointsEnabled;
        });
    }
    getBreakpointsResolvedDefer(scriptId) {
        const existingValue = this._scriptIdToBreakpointsAreResolvedDefer.get(scriptId);
        if (existingValue) {
            return existingValue;
        }
        else {
            const newValue = utils_1.promiseDefer();
            this._scriptIdToBreakpointsAreResolvedDefer.set(scriptId, newValue);
            return newValue;
        }
    }
    onScriptParsed(script) {
        return __awaiter(this, void 0, void 0, function* () {
            // The stack trace and hash can be large and the DA doesn't need it.
            delete script.stackTrace;
            delete script.hash;
            const breakpointsAreResolvedDefer = this.getBreakpointsResolvedDefer(script.scriptId);
            try {
                this.doAfterProcessingSourceEvents(() => __awaiter(this, void 0, void 0, function* () {
                    if (typeof this._columnBreakpointsEnabled === 'undefined') {
                        if (!script.url.includes('internal/per_context')) {
                            yield this.detectColumnBreakpointSupport(script.scriptId);
                            yield this.sendInitializedEvent();
                        }
                    }
                    if (this._earlyScripts) {
                        this._earlyScripts.push(script);
                    }
                    else {
                        yield this.sendLoadedSourceEvent(script);
                    }
                }));
                if (script.url) {
                    script.url = utils.fixDriveLetter(script.url);
                }
                else {
                    script.url = ChromeDebugAdapter.EVAL_NAME_PREFIX + script.scriptId;
                }
                this._scriptContainer.add(script);
                const mappedUrl = yield this.pathTransformer.scriptParsed(script.url);
                const sourceMapsP = this.sourceMapTransformer.scriptParsed(mappedUrl, script.url, script.sourceMapURL).then((sources) => __awaiter(this, void 0, void 0, function* () {
                    if (this._hasTerminated) {
                        return undefined;
                    }
                    yield this._breakpoints.handleScriptParsed(script, this._scriptContainer, mappedUrl, sources);
                    yield this._scriptSkipper.resolveSkipFiles(script, mappedUrl, sources);
                }));
                if (this._initialSourceMapsP) {
                    this._initialSourceMapsP = Promise.all([this._initialSourceMapsP, sourceMapsP]);
                }
                yield sourceMapsP;
                breakpointsAreResolvedDefer.resolve(); // By now no matter which code path we choose, resolving pending breakpoints should be finished, so trigger the defer
            }
            catch (exception) {
                breakpointsAreResolvedDefer.reject(exception);
            }
        });
    }
    sendLoadedSourceEvent(script, loadedSourceEventReason = 'new') {
        return __awaiter(this, void 0, void 0, function* () {
            const origin = this.getReadonlyOrigin(script.url);
            const source = yield this._scriptContainer.scriptToSource(script, origin);
            // This is a workaround for an edge bug, see https://github.com/Microsoft/vscode-chrome-debug-core/pull/329
            switch (loadedSourceEventReason) {
                case 'new':
                case 'changed':
                    if (this._loadedSourcesByScriptId.get(script.scriptId)) {
                        if (source.sourceReference) {
                            // We only need to send changed events for dynamic scripts. The client tracks files on storage on it's own, so this notification is not needed
                            loadedSourceEventReason = 'changed';
                        }
                        else {
                            return; // VS is strict about the changed notifications, and it will fail if we send a changed notification for a file on storage, so we omit it on purpose
                        }
                    }
                    else {
                        loadedSourceEventReason = 'new';
                    }
                    this._loadedSourcesByScriptId.set(script.scriptId, script);
                    break;
                case 'removed':
                    if (!this._loadedSourcesByScriptId.delete(script.scriptId)) {
                        telemetry_1.telemetry.reportEvent('LoadedSourceEventError', { issue: 'Tried to remove non-existent script', scriptId: script.scriptId });
                        return;
                    }
                    break;
                default:
                    telemetry_1.telemetry.reportEvent('LoadedSourceEventError', { issue: 'Unknown reason', reason: loadedSourceEventReason });
            }
            const scriptEvent = new vscode_debugadapter_1.LoadedSourceEvent(loadedSourceEventReason, source);
            this._session.sendEvent(scriptEvent);
        });
    }
    /* __GDPR__
        "ClientRequest/toggleSmartStep" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    toggleSmartStep() {
        return __awaiter(this, void 0, void 0, function* () {
            this._smartStepEnabled = !this._smartStepEnabled;
            this.onPaused(this._lastPauseState.event, this._lastPauseState.expecting);
        });
    }
    /* __GDPR__
        "ClientRequest/toggleSkipFileStatus" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    toggleSkipFileStatus(args) {
        return __awaiter(this, void 0, void 0, function* () {
            if (args.path) {
                args.path = utils.fileUrlToPath(args.path);
                args.path = remoteMapper_1.mapRemoteClientToInternalPath(args.path);
            }
            if (!(yield this.isInCurrentStack(args))) {
                // Only valid for files that are in the current stack
                const logName = args.path || this._scriptContainer.displayNameForSourceReference(args.sourceReference);
                vscode_debugadapter_1.logger.log(`Can't toggle the skipFile status for ${logName} - it's not in the current stack.`);
                return;
            }
            else {
                this._scriptSkipper.toggleSkipFileStatus(args, this._scriptContainer, this._transformers);
                this.onPaused(this._lastPauseState.event, this._lastPauseState.expecting);
            }
        });
    }
    isInCurrentStack(args) {
        return __awaiter(this, void 0, void 0, function* () {
            const currentStack = yield this.stackTrace({ threadId: undefined });
            if (args.path) {
                return currentStack.stackFrames.some(frame => frame.source && frame.source.path === args.path);
            }
            else {
                return currentStack.stackFrames.some(frame => frame.source && frame.source.sourceReference === args.sourceReference);
            }
        });
    }
    /* __GDPR__
        "ClientRequest/loadedSources" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    loadedSources() {
        return __awaiter(this, void 0, void 0, function* () {
            const sources = yield Promise.all(Array.from(this._scriptContainer.loadedScripts)
                .map(script => this._scriptContainer.scriptToSource(script, this.getReadonlyOrigin(script.url))));
            return { sources: sources.sort((a, b) => a.path.localeCompare(b.path)) };
        });
    }
    onConsoleAPICalled(event) {
        if (this._launchAttachArgs._suppressConsoleOutput) {
            return;
        }
        const result = consoleHelper_1.formatConsoleArguments(event.type, event.args, event.stackTrace);
        const stack = internalSourceBreakpoint_1.stackTraceWithoutLogpointFrame(event.stackTrace);
        if (result) {
            this.logObjects(result.args, result.isError, stack);
        }
    }
    onLogEntryAdded(event) {
        // The Debug Console doesn't give the user a way to filter by level, just ignore 'verbose' logs
        if (event.entry.level === 'verbose') {
            return;
        }
        const args = event.entry.args || [];
        let text = event.entry.text || '';
        if (event.entry.url && !event.entry.stackTrace) {
            if (text) {
                text += ' ';
            }
            text += `[${event.entry.url}]`;
        }
        if (text) {
            args.unshift({
                type: 'string',
                value: text
            });
        }
        const type = event.entry.level === 'error' ? 'error' :
            event.entry.level === 'warning' ? 'warning' :
                'log';
        const result = consoleHelper_1.formatConsoleArguments(type, args, event.entry.stackTrace);
        const stack = event.entry.stackTrace;
        if (result) {
            this.logObjects(result.args, result.isError, stack);
        }
    }
    logObjects(objs, isError = false, stackTrace) {
        return __awaiter(this, void 0, void 0, function* () {
            // This is an asynchronous method, so ensure that we handle one at a time so that they are sent out in the same order that they came in.
            this._currentLogMessage = this._currentLogMessage
                .then(() => __awaiter(this, void 0, void 0, function* () {
                const category = isError ? 'stderr' : 'stdout';
                // Shortcut the common log case to reduce unnecessary back and forth
                let e;
                if (objs.length === 1 && objs[0].type === 'string') {
                    let msg = objs[0].value;
                    if (isError) {
                        msg = yield this._stackFrames.mapFormattedException(msg, this._transformers);
                    }
                    if (!msg.endsWith(consoleHelper_1.clearConsoleCode)) {
                        // If this string will clear the console, don't append a \n
                        msg += '\n';
                    }
                    e = new vscode_debugadapter_1.OutputEvent(msg, category);
                }
                else {
                    e = new vscode_debugadapter_1.OutputEvent('output', category);
                    e.body.variablesReference = this._variablesManager.createHandle(new variables.LoggedObjects(objs), 'repl');
                }
                if (stackTrace && stackTrace.callFrames.length) {
                    const stackFrame = yield this._stackFrames.mapCallFrame(stackTrace.callFrames[0], this._transformers, this._scriptContainer, this.originProvider);
                    e.body.source = remoteMapper_1.mapInternalSourceToRemoteClient(stackFrame.source, this._launchAttachArgs.remoteAuthority);
                    e.body.line = stackFrame.line;
                    e.body.column = stackFrame.column;
                }
                this._session.sendEvent(e);
            }))
                .catch(err => vscode_debugadapter_1.logger.error(err.toString()));
        });
    }
    onExceptionThrown(params) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._launchAttachArgs._suppressConsoleOutput) {
                return;
            }
            return this._currentLogMessage = this._currentLogMessage.then(() => __awaiter(this, void 0, void 0, function* () {
                const formattedException = consoleHelper_1.formatExceptionDetails(params.exceptionDetails);
                const exceptionStr = yield this._stackFrames.mapFormattedException(formattedException, this._transformers);
                const e = new vscode_debugadapter_1.OutputEvent(exceptionStr + '\n', 'stderr');
                const stackTrace = params.exceptionDetails.stackTrace;
                if (stackTrace && stackTrace.callFrames.length) {
                    const stackFrame = yield this._stackFrames.mapCallFrame(stackTrace.callFrames[0], this._transformers, this._scriptContainer, this.originProvider);
                    e.body.source = remoteMapper_1.mapInternalSourceToRemoteClient(stackFrame.source, this._launchAttachArgs.remoteAuthority);
                    e.body.line = stackFrame.line;
                    e.body.column = stackFrame.column;
                }
                this._session.sendEvent(e);
            }))
                .catch(err => vscode_debugadapter_1.logger.error(err.toString()));
        });
    }
    /**
     * For backcompat, also listen to Console.messageAdded, only if it looks like the old format.
     */
    onMessageAdded(params) {
        // message.type is undefined when Runtime.consoleAPICalled is being sent
        if (params && params.message && params.message.type) {
            const onConsoleAPICalledParams = {
                type: params.message.type,
                timestamp: params.message.timestamp,
                args: params.message.parameters || [{ type: 'string', value: params.message.text }],
                stackTrace: params.message.stack,
                executionContextId: 1
            };
            this.onConsoleAPICalled(onConsoleAPICalledParams);
        }
    }
    /* __GDPR__
        "ClientRequest/disconnect" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    disconnect(args) {
        telemetry_1.telemetry.reportEvent('FullSessionStatistics/SourceMaps/Overrides', { aspNetClientAppFallbackCount: sourceMapUtils.getAspNetFallbackCount() });
        this._clientRequestedSessionEnd = true;
        this.shutdown();
        this.terminateSession('Got disconnect request', args);
    }
    /* __GDPR__
        "ClientRequest/setBreakpoints" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    setBreakpoints(args, _, requestSeq, ids) {
        if (args.source.path) {
            args.source.path = remoteMapper_1.mapRemoteClientToInternalPath(args.source.path);
        }
        this.reportBpTelemetry(args);
        return this._breakpoints.setBreakpoints(args, this._scriptContainer, requestSeq, ids);
    }
    reportBpTelemetry(args) {
        let fileExt = '';
        if (args.source.path) {
            fileExt = path.extname(args.source.path);
            fileExt = path.extname(args.source.path);
        }
        /* __GDPR__
           "setBreakpointsRequest" : {
              "fileExt" : { "classification": "CustomerContent", "purpose": "FeatureInsight" },
              "${include}": [ "${DebugCommonProperties}" ]
           }
         */
        telemetry_1.telemetry.reportEvent('setBreakpointsRequest', { fileExt });
    }
    /* __GDPR__
        "ClientRequest/setExceptionBreakpoints" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    setExceptionBreakpoints(args) {
        let state;
        if (args.filters.indexOf('all') >= 0) {
            state = 'all';
        }
        else if (args.filters.indexOf('uncaught') >= 0) {
            state = 'uncaught';
        }
        else {
            state = 'none';
        }
        if (args.filters.indexOf('promise_reject') >= 0) {
            this._pauseOnPromiseRejections = true;
        }
        else {
            this._pauseOnPromiseRejections = false;
        }
        return this.chrome.Debugger.setPauseOnExceptions({ state })
            .then(() => { });
    }
    /* __GDPR__
        "ClientRequest/continue" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    /**
     * internal -> suppress telemetry
     */
    continue(internal = false) {
        /* __GDPR__
           "continueRequest" : {
              "${include}": [ "${DebugCommonProperties}" ]
           }
         */
        if (!internal)
            telemetry_1.telemetry.reportEvent('continueRequest');
        if (!this.chrome) {
            return utils.errP(errors.runtimeNotConnectedMsg);
        }
        this._expectingResumedEvent = true;
        return this._currentStep = this.chrome.Debugger.resume()
            .then(() => { }, () => { });
    }
    /* __GDPR__
        "ClientRequest/next" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    next() {
        if (!this.chrome) {
            return utils.errP(errors.runtimeNotConnectedMsg);
        }
        /* __GDPR__
           "nextRequest" : {
               "${include}": [ "${DebugCommonProperties}" ]
           }
         */
        telemetry_1.telemetry.reportEvent('nextRequest');
        this._expectingStopReason = 'step';
        this._expectingResumedEvent = true;
        return this._currentStep = this.chrome.Debugger.stepOver()
            .then(() => { }, () => { });
    }
    /* __GDPR__
        "ClientRequest/stepIn" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    stepIn(userInitiated = true) {
        if (!this.chrome) {
            return utils.errP(errors.runtimeNotConnectedMsg);
        }
        if (userInitiated) {
            /* __GDPR__
               "stepInRequest" : {
                  "${include}": [ "${DebugCommonProperties}" ]
               }
             */
            telemetry_1.telemetry.reportEvent('stepInRequest');
        }
        this._expectingStopReason = 'step';
        this._expectingResumedEvent = true;
        return this._currentStep = this.chrome.Debugger.stepInto({ breakOnAsyncCall: true })
            .then(() => { }, () => { });
    }
    /* __GDPR__
        "ClientRequest/stepOut" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    stepOut() {
        if (!this.chrome) {
            return utils.errP(errors.runtimeNotConnectedMsg);
        }
        /* __GDPR__
           "stepOutRequest" : {
              "${include}": [ "${DebugCommonProperties}" ]
           }
         */
        telemetry_1.telemetry.reportEvent('stepOutRequest');
        this._expectingStopReason = 'step';
        this._expectingResumedEvent = true;
        return this._currentStep = this.chrome.Debugger.stepOut()
            .then(() => { }, () => { });
    }
    /* __GDPR__
        "ClientRequest/stepBack" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    stepBack() {
        return this.chrome.TimeTravel.stepBack()
            .then(() => { }, () => { });
    }
    /* __GDPR__
        "ClientRequest/reverseContinue" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    reverseContinue() {
        return this.chrome.TimeTravel.reverse()
            .then(() => { }, () => { });
    }
    /* __GDPR__
        "ClientRequest/pause" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    pause() {
        if (!this.chrome) {
            return utils.errP(errors.runtimeNotConnectedMsg);
        }
        /* __GDPR__
           "pauseRequest" : {
              "${include}": [ "${DebugCommonProperties}" ]
           }
         */
        telemetry_1.telemetry.reportEvent('pauseRequest');
        this._expectingStopReason = 'pause';
        return this._currentStep = this.chrome.Debugger.pause()
            .then(() => { });
    }
    /* __GDPR__
        "ClientRequest/stackTrace" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    stackTrace(args) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._currentPauseNotification) {
                return Promise.reject(errors.noCallStackAvailable());
            }
            const stackTraceResponse = yield this._stackFrames.getStackTrace({
                args,
                originProvider: this.originProvider,
                scripts: this._scriptContainer,
                scriptSkipper: this._scriptSkipper,
                smartStepper: this._smartStepper,
                transformers: this._transformers,
                pauseEvent: this._currentPauseNotification
            });
            stackTraceResponse.stackFrames = stackTraceResponse.stackFrames.map(frame => {
                return Object.assign({}, frame, { source: remoteMapper_1.mapInternalSourceToRemoteClient(frame.source, this._launchAttachArgs.remoteAuthority) });
            });
            return stackTraceResponse;
        });
    }
    /**
     * A stub method for overriding (used for the node debug adapter)
     */
    getReadonlyOrigin(_url) {
        // To override
        return undefined;
    }
    realPathToDisplayPath(realPath) { return this._scriptContainer.realPathToDisplayPath(realPath); }
    displayPathToRealPath(displayPath) { return this._scriptContainer.displayPathToRealPath(displayPath); }
    /* __GDPR__
        "ClientRequest/scopes" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    scopes(args) {
        return this._stackFrames.getScopes({
            args,
            scripts: this._scriptContainer,
            variables: this._variablesManager,
            transformers: this._transformers,
            pauseEvent: this._currentPauseNotification,
            currentException: this._exception
        });
    }
    /* __GDPR__
        "ClientRequest/variables" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    variables(args) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this._variablesManager.getVariables(args);
            const variables = result ? result.variables : [];
            return { variables: variables.filter(v => ChromeDebugAdapter.FILTERED_VARIABLE_NAMES.indexOf(v.name) === -1) };
        });
    }
    /* __GDPR__
        "ClientRequest/source" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    source(args) {
        let scriptId;
        if (args.sourceReference) {
            const handle = this._scriptContainer.getSource(args.sourceReference);
            if (!handle) {
                return Promise.reject(errors.sourceRequestIllegalHandle());
            }
            // Have inlined content?
            if (handle.contents) {
                return Promise.resolve({
                    content: handle.contents
                });
            }
            scriptId = handle.scriptId;
        }
        else if (args.source && args.source.path) {
            const realPath = this.displayPathToRealPath(args.source.path);
            // Request url has chars unescaped, but they will be escaped in scriptsByUrl
            const script = this.getScriptByUrl(utils.isURL(realPath) ?
                encodeURI(realPath) :
                realPath);
            if (!script) {
                return Promise.reject(errors.sourceRequestCouldNotRetrieveContent());
            }
            scriptId = script.scriptId;
        }
        if (!scriptId) {
            return Promise.reject(errors.sourceRequestCouldNotRetrieveContent());
        }
        // If not, should have scriptId
        return this.chrome.Debugger.getScriptSource({ scriptId }).then(response => {
            return {
                content: response.scriptSource,
                mimeType: 'text/javascript'
            };
        });
    }
    /* __GDPR__
        "ClientRequest/threads" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    threads() {
        return {
            threads: [
                {
                    id: ChromeDebugAdapter.THREAD_ID,
                    name: this.threadName()
                }
            ]
        };
    }
    threadName() {
        return 'Thread ' + ChromeDebugAdapter.THREAD_ID;
    }
    /* __GDPR__
        "ClientRequest/evaluate" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    evaluate(args) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.chrome) {
                return utils.errP(errors.runtimeNotConnectedMsg);
            }
            if (args.expression.startsWith(ChromeDebugAdapter.SCRIPTS_COMMAND)) {
                return this.handleScriptsCommand(args);
            }
            if (args.expression.startsWith('{') && args.expression.endsWith('}')) {
                args.expression = `(${args.expression})`;
            }
            const evalResponse = yield this.waitThenDoEvaluate(args.expression, args.frameId, { generatePreview: true });
            // Convert to a Variable object then just copy the relevant fields off
            const variable = yield this._variablesManager.remoteObjectToVariable(args.expression, evalResponse.result, /*parentEvaluateName=*/ undefined, /*stringify=*/ undefined, args.context);
            if (evalResponse.exceptionDetails) {
                let resultValue = variable.value;
                if (resultValue && (resultValue.startsWith('ReferenceError: ') || resultValue.startsWith('TypeError: ')) && args.context !== 'repl') {
                    resultValue = errors.evalNotAvailableMsg;
                }
                return utils.errP(resultValue);
            }
            return {
                result: variable.value,
                variablesReference: variable.variablesReference,
                indexedVariables: variable.indexedVariables,
                namedVariables: variable.namedVariables,
                type: variable.type
            };
        });
    }
    /**
     * Handle the .scripts command, which can be used as `.scripts` to return a list of all script details,
     * or `.scripts <url>` to show the contents of the given script.
     */
    handleScriptsCommand(args) {
        let outputStringP;
        const scriptsRest = utils.lstrip(args.expression, ChromeDebugAdapter.SCRIPTS_COMMAND).trim();
        if (scriptsRest) {
            // `.scripts <url>` was used, look up the script by url
            const requestedScript = this.getScriptByUrl(scriptsRest);
            if (requestedScript) {
                outputStringP = this.chrome.Debugger.getScriptSource({ scriptId: requestedScript.scriptId })
                    .then(result => {
                    const maxLength = 1e5;
                    return result.scriptSource.length > maxLength ?
                        result.scriptSource.substr(0, maxLength) + '[⋯]' :
                        result.scriptSource;
                });
            }
            else {
                outputStringP = Promise.resolve(`No runtime script with url: ${scriptsRest}\n`);
            }
        }
        else {
            outputStringP = this._scriptContainer.getAllScriptsString(this.pathTransformer, this.sourceMapTransformer);
        }
        return outputStringP.then(scriptsStr => {
            this._session.sendEvent(new vscode_debugadapter_1.OutputEvent(scriptsStr));
            return {
                result: '',
                variablesReference: 0
            };
        });
    }
    _shouldSmartStepCallFrame(frame) {
        return __awaiter(this, void 0, void 0, function* () {
            const stackFrame = this._stackFrames.callFrameToStackFrame(frame, this._scriptContainer, this.originProvider);
            const fakeResponse = { stackFrames: [stackFrame] };
            yield this.pathTransformer.stackTraceResponse(fakeResponse);
            yield this.sourceMapTransformer.stackTraceResponse(fakeResponse);
            return this._smartStepper.shouldSmartStep(fakeResponse.stackFrames[0], this.pathTransformer, this.sourceMapTransformer);
        });
    }
    /**
     * Allow consumers to override just because of https://github.com/nodejs/node/issues/8426
     */
    globalEvaluate(args) {
        return this.chrome.Runtime.evaluate(args);
    }
    waitThenDoEvaluate(expression, frameId, extraArgs) {
        return __awaiter(this, void 0, void 0, function* () {
            const waitThenEval = this._waitAfterStep.then(() => this.doEvaluate(expression, frameId, extraArgs));
            this._waitAfterStep = waitThenEval.then(() => { }, () => { }); // to Promise<void> and handle failed evals
            return waitThenEval;
        });
    }
    doEvaluate(expression, frameId, extraArgs) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof frameId === 'number') {
                const frame = this._stackFrames.getFrame(frameId);
                if (!frame || !frame.callFrameId) {
                    return utils.errP(errors.evalNotAvailableMsg);
                }
                return this.evaluateOnCallFrame(expression, frame, extraArgs);
            }
            else {
                let args = {
                    expression,
                    // silent because of an issue where node will sometimes hang when breaking on exceptions in console messages. Fixed somewhere between 8 and 8.4
                    silent: true,
                    includeCommandLineAPI: true,
                    objectGroup: 'console',
                    userGesture: true
                };
                if (extraArgs) {
                    args = Object.assign(args, extraArgs);
                }
                return this.globalEvaluate(args);
            }
        });
    }
    evaluateOnCallFrame(expression, frame, extraArgs) {
        return __awaiter(this, void 0, void 0, function* () {
            const callFrameId = frame.callFrameId;
            let args = {
                callFrameId,
                expression,
                // silent because of an issue where node will sometimes hang when breaking on exceptions in console messages. Fixed somewhere between 8 and 8.4
                silent: true,
                includeCommandLineAPI: true,
                objectGroup: 'console'
            };
            if (extraArgs) {
                args = Object.assign(args, extraArgs);
            }
            return this.chrome.Debugger.evaluateOnCallFrame(args);
        });
    }
    /* __GDPR__
        "ClientRequest/setVariable" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    setVariable(args) {
        return this._variablesManager.setVariable(args);
    }
    /* __GDPR__
        "ClientRequest/restartFrame" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    restartFrame(args) {
        return __awaiter(this, void 0, void 0, function* () {
            const callFrame = this._stackFrames.getFrame(args.frameId);
            if (!callFrame || !callFrame.callFrameId) {
                return utils.errP(errors.noRestartFrame);
            }
            try {
                yield this.chrome.Debugger.restartFrame({ callFrameId: callFrame.callFrameId });
            }
            catch (_e) { } // Fails in Electron 6, ignore: https://github.com/microsoft/vscode/issues/86411
            this._expectingStopReason = 'frame_entry';
            return this.chrome.Debugger.stepInto({});
        });
    }
    /* __GDPR__
        "ClientRequest/completions" : {
            "${include}": [
                "${IExecutionResultTelemetryProperties}",
                "${DebugCommonProperties}"
            ]
        }
    */
    completions(args) {
        return __awaiter(this, void 0, void 0, function* () {
            const text = args.text;
            const column = args.column;
            // 1-indexed column
            const prefix = text.substring(0, column - 1);
            let expression;
            const dot = prefix.lastIndexOf('.');
            if (dot >= 0) {
                expression = prefix.substr(0, dot);
            }
            if (typeof args.frameId === 'number' && !expression) {
                vscode_debugadapter_1.logger.verbose(`Completions: Returning global completions`);
                // If no expression was passed, we must be getting global completions at a breakpoint
                if (!this._stackFrames.getFrame(args.frameId)) {
                    return Promise.reject(errors.stackFrameNotValid());
                }
                const callFrame = this._stackFrames.getFrame(args.frameId);
                if (!callFrame || !callFrame.callFrameId) {
                    // Async frame or label
                    return { targets: [] };
                }
                const scopeExpandPs = callFrame.scopeChain
                    .map(scope => new variables_1.ScopeContainer(callFrame.callFrameId, undefined, scope.object.objectId).expand(this._variablesManager));
                return Promise.all(scopeExpandPs)
                    .then((variableArrs) => {
                    const targets = this.getFlatAndUniqueCompletionItems(variableArrs.map(variableArr => variableArr.map(variable => variable.name)));
                    return { targets };
                });
            }
            else {
                expression = expression || 'this';
                vscode_debugadapter_1.logger.verbose(`Completions: Returning for expression '${expression}'`);
                const getCompletionsFn = `(function(x){var a=[];for(var o=x;o!==null&&typeof o !== 'undefined';o=o.__proto__){a.push(Object.getOwnPropertyNames(o))};return a})(${expression})`;
                const response = yield this.waitThenDoEvaluate(getCompletionsFn, args.frameId, { returnByValue: true });
                if (response.exceptionDetails) {
                    return { targets: [] };
                }
                else {
                    return { targets: this.getFlatAndUniqueCompletionItems(response.result.value) };
                }
            }
        });
    }
    getFlatAndUniqueCompletionItems(arrays) {
        const set = new Set();
        const items = [];
        for (let i = 0; i < arrays.length; i++) {
            for (let name of arrays[i]) {
                if (!variables_1.isIndexedPropName(name) && !set.has(name)) {
                    set.add(name);
                    items.push({
                        label: name,
                        type: 'property'
                    });
                }
            }
        }
        return items;
    }
    getScriptByUrl(url) {
        return this._scriptContainer.getScriptByUrl(url);
    }
    breakpointLocations(args, _telemetryPropertyCollector, requestSeq) {
        return this._breakpoints.getBreakpointsLocations(args, this._scriptContainer, requestSeq);
    }
}
ChromeDebugAdapter.EVAL_NAME_PREFIX = ChromeUtils.EVAL_NAME_PREFIX;
ChromeDebugAdapter.EVAL_ROOT = '<eval>';
/**
 * Names of variables and properties to be filtered out of the results
 * from the adapter.
 */
ChromeDebugAdapter.FILTERED_VARIABLE_NAMES = ['[[StableObjectId]]'];
ChromeDebugAdapter.SCRIPTS_COMMAND = '.scripts';
ChromeDebugAdapter.THREAD_ID = 1;
ChromeDebugAdapter.ASYNC_CALL_STACK_DEPTH = 4;
exports.ChromeDebugAdapter = ChromeDebugAdapter;

//# sourceMappingURL=chromeDebugAdapter.js.map
