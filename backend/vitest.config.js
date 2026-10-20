module.exports = {
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false,
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
