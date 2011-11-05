{
  schema,
  [
    {version, "1.1"},
    {n_val, 3},
    {default_field, "text"},
    {default_op, "or"},
    {analyzer_factory, {erlang, text_analyzers, whitespace_analyzer_factory}}
  ],
  [
    {field, [
      {name, "id_str"},
      {type, integer},
      {required, true},
      {padding, 19},
      {analyzer_factory, {erlang, text_analyzers, integer_analyzer_factory}}
    ]},
    {field, [
      {name, "tweet"},
      {type, string},
      {required, true},
      {analyzer_factory, {erlang, text_analyzers, standard_analyzer_factory}}
    ]},
    {field, [
      {name, "tweeted_at"},
      {type, date},
      {required, true},
      {analyzer_factory, {erlang, text_analyzers, noop_analyzer_factory}}
    ]},
    {field, [
      {name, "tweeted_at"},
      {type, string},
      {required, true},
      {analyzer_factory, {erlang, text_analyzers, noop_analyzer_factory}}
    ]},
    {dynamic_field, [
      {name, "*"},
      {skip, true}
    ]}
  ]
}.
