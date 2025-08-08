/**
 * Reporting implementations
 */

export * from '../types/reporting';

// Core reporters
export { BaseReporter, DefaultDataRedactor } from './base-reporter';
export { JsonReporter } from './json-reporter';
export { HtmlReporter } from './html-reporter';
export { JunitReporter } from './junit-reporter';
export { BadgeReporter } from './badge-reporter';

// Report management
export { ReportManager } from './report-manager';

// Telemetry integration
export {
  TelemetryManager,
  OpenTelemetryProvider,
  SentryProvider,
  type TelemetryProvider,
} from './telemetry';
