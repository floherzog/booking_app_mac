import forms from '@tailwindcss/forms'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  // Must cover every file that emits classes, or they vanish from the packaged build.
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,jsx}',
    './src/core/**/*.js',
  ],
  theme: {
    extend: {},
  },
  plugins: [forms],
}
