module.exports = {
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.js'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      reporter: ['text', 'html', 'json-summary'],
    },
  },
};
