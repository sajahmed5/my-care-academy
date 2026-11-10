-- Every issue report says what kind it is (issue report 100): something
-- wrong, a question, wording to change or an idea. Reports from before
-- this are problems, which is what the form only ever took. The table's
-- grants cover the new column.
alter table public.issue_reports
  add column kind text not null default 'problem'
    check (kind in ('problem', 'question', 'wording', 'idea'));
