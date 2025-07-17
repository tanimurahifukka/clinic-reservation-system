import i18next from 'i18next';
import { logger } from './logger';

// Language configuration
const SUPPORTED_LANGUAGES = ['ja', 'en', 'zh', 'ko'];
const DEFAULT_LANGUAGE = 'ja';

// Initialize i18next
// Load translation files manually for serverless environment
const loadTranslations = () => {
  const translations: Record<string, any> = {};
  
  // Import translation files
  try {
    // Japanese
    translations.ja = {
      common: require('../locales/ja/common.json'),
      booking: require('../locales/ja/booking.json'),
    };
    
    // English
    translations.en = {
      common: require('../locales/en/common.json'),
      booking: require('../locales/en/booking.json'),
    };
    
    // Add Chinese and Korean when ready
    // translations.zh = { ... };
    // translations.ko = { ... };
  } catch (error) {
    logger.error('Failed to load translation files', { error });
  }
  
  return translations;
};

export const initI18n = async (): Promise<void> => {
  try {
    const resources = loadTranslations();
    
    await i18next.init({
      resources,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: SUPPORTED_LANGUAGES,
      ns: ['common', 'booking', 'notification', 'error'],
      defaultNS: 'common',
      interpolation: {
        escapeValue: false,
      },
      debug: process.env.STAGE === 'dev',
    });
    
    logger.info('i18n initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize i18n', { error });
    throw error;
  }
};

// Get translation with parameters support
export const getTranslation = (key: string, language: string = DEFAULT_LANGUAGE, params?: Record<string, any>): string => {
  const t = getTranslator(language);
  const translation = t(key, params);
  return typeof translation === 'string' ? translation : String(translation);
};

// Get translation function for a specific language
export const getTranslator = (language: string = DEFAULT_LANGUAGE) => {
  const lng = SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
  return i18next.getFixedT(lng);
};

// Translate with fallback
export const translate = (
  key: string,
  language: string = DEFAULT_LANGUAGE,
  options?: any
): string => {
  const t = getTranslator(language);
  const result = t(key, options);
  // Ensure we always return a string
  return typeof result === 'string' ? result : String(result);
};

// Get user's preferred language from event
export const getUserLanguage = (event: any): string => {
  // Check Accept-Language header
  const acceptLanguage = event.headers?.['Accept-Language'] || '';
  const browserLang = acceptLanguage.split(',')[0]?.split('-')[0];
  
  if (SUPPORTED_LANGUAGES.includes(browserLang)) {
    return browserLang;
  }
  
  // Check user context from authorizer
  const userContext = event.requestContext?.authorizer;
  if (userContext?.preferredLanguage && SUPPORTED_LANGUAGES.includes(userContext.preferredLanguage)) {
    return userContext.preferredLanguage;
  }
  
  // Check query parameter
  const queryLang = event.queryStringParameters?.lang;
  if (queryLang && SUPPORTED_LANGUAGES.includes(queryLang)) {
    return queryLang;
  }
  
  return DEFAULT_LANGUAGE;
};

// Language-specific date formatting
export const formatDate = (date: Date, language: string = DEFAULT_LANGUAGE): string => {
  const locales: Record<string, string> = {
    ja: 'ja-JP',
    en: 'en-US',
    zh: 'zh-CN',
    ko: 'ko-KR',
  };
  
  return new Intl.DateTimeFormat(locales[language] || locales[DEFAULT_LANGUAGE], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

// Language-specific currency formatting
export const formatCurrency = (amount: number, language: string = DEFAULT_LANGUAGE): string => {
  const currency = 'JPY'; // Japanese Yen
  const locales: Record<string, string> = {
    ja: 'ja-JP',
    en: 'en-US',
    zh: 'zh-CN',
    ko: 'ko-KR',
  };
  
  return new Intl.NumberFormat(locales[language] || locales[DEFAULT_LANGUAGE], {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Export supported languages
export { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE };