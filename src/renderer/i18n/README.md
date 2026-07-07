# Internationalization (i18n) Guide

This project uses `react-i18next` for internationalization support.

## Why this structure

- Use English-only keys in code for cleaner logic.
- Keep all user-facing translations in JSON files.
- Preserve TypeScript-friendly key usage patterns.
- Support automatic language detection.
- Persist language preference in `localStorage`.

## Basic usage

### 1. Use translations in a component

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('welcome.title')}</h1>
      <button>{t('common.save')}</button>
    </div>
  );
}
```

### 2. Interpolation with variables

```tsx
// en.json
{
  "welcome": {
    "greeting": "Hello, {{name}}!"
  }
}

// usage
{t('welcome.greeting', { name: 'John' })}
```

### 3. Pluralization

```tsx
// en.json
{
  "mcp": {
    "toolsAvailable": "{{count}} tool available",
    "toolsAvailable_plural": "{{count}} tools available"
  }
}

// usage
{t('mcp.toolsAvailable', { count: 1 })} // "1 tool available"
{t('mcp.toolsAvailable', { count: 5 })} // "5 tools available"
```

### 4. Switch language

```tsx
import { useTranslation } from 'react-i18next';

function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (lang: 'en' | 'zh') => {
    i18n.changeLanguage(lang);
  };

  return (
    <button onClick={() => changeLanguage('zh')}>Switch language</button>
  );
}
```

## Add new translations

1. Add English text in `src/renderer/i18n/locales/en.json`.
2. Add localized text in other locale files if needed.
3. Reference keys with `t('key.path')` in code.

## Translation file structure

Organize keys by feature module:

```json
{
  "common": {},
  "welcome": {},
  "settings": {},
  "mcp": {},
  "credentials": {}
}
```

## Language switcher component

The `LanguageSwitcher` component can be used in any view:

```tsx
import { LanguageSwitcher } from './components/LanguageSwitcher';

<LanguageSwitcher />
```

## Best practices

1. Use meaningful keys, such as `welcome.title`.
2. Keep the same key structure across locale files.
3. Avoid hard-coded user-visible strings.
4. Use dot-separated namespaces for organization.
