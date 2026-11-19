-- params: []
-- database: agile_local
select m.id, m.raid_item_id, m.responsible_id, m.target_date, m.is_completed, m.completed_at from raid_mitigating_actions m join raid_items r on r.id = m.raid_item_id join projects p on p.id = r.project_id where p.archived_at is null;
