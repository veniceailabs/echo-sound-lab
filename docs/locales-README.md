# Echo Sound Lab - Internationalization (i18n)

## Supported Languages

- **English** (`en`) - Default
- **Spanish** (`es`) - Español
- **Thai** (`th`) - ไทย

## Adding New Languages

To add a new language:

1. Create a new JSON file in `src/locales/` (e.g., `fr.json` for French)
2. Copy the structure from `en.json`
3. Translate all values while keeping keys the same
4. Add the language code to the `SupportedLanguage` type in `src/services/i18nService.ts`
5. Add the language metadata to `getSupportedLanguages()` in `i18nService.ts`

## Usage in Components

```typescript
import { i18nService } from '../services/i18nService';

// Get a translation
const title = i18nService.t('settings.title');

// Listen for language changes
useEffect(() => {
  const handleChange = () => forceUpdate({});
  window.addEventListener('languageChanged', handleChange);
  return () => window.removeEventListener('languageChanged', handleChange);
}, []);
```

## Translation File Structure

All translation files must follow this structure:

```json
{
  "appName": "...",
  "loading": "...",
  "error": "...",
  "success": "...",
  "settings": { ... },
  "controls": { ... },
  "processing": { ... },
  "meters": { ... },
  "report": { ... },
  "modes": { ... }
}
```

## Auto-Detection

The app automatically detects the user's system language on first visit. Users can manually override this in Settings.

## Storage

Selected language is stored in `localStorage` as `echo-language` and persists across sessions.
