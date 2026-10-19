#!/usr/bin/env python3
"""Build self-contained offline app; fail closed on invalid catalog or broken citations."""
import json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
catalog = json.loads((root / 'data/catalog.json').read_text(encoding='utf-8'))
assert catalog['schema_version'] == 1
ids = {source['id'] for source in catalog['sources']}
assert len(ids) == len(catalog['sources'])
for group in ('packs', 'products', 'patches'):
    for record in catalog[group]:
        assert set(record['source_ids']) <= ids, (group, record)
for item in catalog['packs']:
    assert item['quna'] > 0 and item['usd_cents'] > 0 and item['mileage'] >= 0
for item in catalog['mileage_items']:
    assert item['mileage'] > 0
raw = json.dumps(catalog, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
template = (root / 'src/app.template.html').read_text(encoding='utf-8')
assert template.count('/* DATA_INSERT */') == 1
out = template.replace('/* DATA_INSERT */', raw)
(root / 'index.html').write_text(out, encoding='utf-8')

# Second independent, completely offline page for the local-only character profile.
profile_catalog = json.loads((root / 'data/progression_catalog.json').read_text(encoding='utf-8'))
exchange = json.loads((root / 'data/exchange_observations_2026-10-19.json').read_text(encoding='utf-8'))
assert profile_catalog['schema'] == 'heaven-gg/aion2-progression-catalog/v1'
source_ids = {source['id'] for source in profile_catalog['sources']}
assert len(source_ids) == len(profile_catalog['sources'])
assert any(source['grade'] == 'primary' for source in profile_catalog['sources'])
assert len({slot['id'] for slot in profile_catalog['gearSlots']}) == len(profile_catalog['gearSlots'])
for example in profile_catalog['gearExamples']:
    assert example['sourceId'] in source_ids
    assert example['slot'] in {slot['id'] for slot in profile_catalog['gearSlots']}
for activity in profile_catalog['activities']:
    assert activity['sourceId'] in source_ids
    assert activity['referenceRewardKina'] >= 0 and activity['requiredItemLevel'] > 0
assert exchange['price_kind'] == 'lowest_listing'
profile_template = (root / 'src/profile.template.html').read_text(encoding='utf-8')
engine = (root / 'scripts/profile-engine.mjs').read_text(encoding='utf-8')
assert '</script' not in engine.lower()
parts = {
    '/* PROFILE_DATA_INSERT */': json.dumps(profile_catalog, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c'),
    '/* EXCHANGE_DATA_INSERT */': json.dumps(exchange, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c'),
    '/* PROFILE_ENGINE_INSERT */': engine.strip(),
}
for marker, data in parts.items():
    assert profile_template.count(marker) == 1, marker
    profile_template = profile_template.replace(marker, data)
(root / 'profile.html').write_text(profile_template, encoding='utf-8')
print('Built index.html and offline profile.html from source-linked data.')
