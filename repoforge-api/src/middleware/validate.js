module.exports = (schema) => (req, res, next) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params
    });
    next();
  } catch (err) {
    const errorDetails = err.errors.map(e => ({
      field: e.path.join('.').replace('body.', '').replace('query.', '').replace('params.', ''),
      message: e.message
    }));
    return res.status(400).json({ error: 'Validation failed', details: errorDetails });
  }
};
