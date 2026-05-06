export default {
  test: {
    environment: 'node',
    pool: 'forks',  // required: sync-engine tests use require.cache injection
  },
};
