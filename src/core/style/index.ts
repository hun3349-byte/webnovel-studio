// ============================================================================
// Style Evolution Engine - Main Exports
// ============================================================================

// Style Analyzer
export {
  analyzeStyle,
  analyzeStyleFromFeedback,
  analyzeFullNovel,
} from './style-analyzer';

// StyleDNA Manager
export {
  saveStyleDNA,
  getStyleDNAs,
  getActiveStyleDNAs,
  getStyleDNA,
  updateStyleDNA,
  deleteStyleDNA,
  mergeDNAs,
  getMergedDNA,
} from './style-dna-manager';

// Style Injector
export {
  buildDynamicStyleDNA,
  getDefaultStyleDNA,
  hasStyleDNA,
} from './style-injector';

// Feedback Learner
export {
  learnFromFeedback,
  triggerFeedbackLearning,
  hasSignificantChanges,
} from './feedback-learner';
