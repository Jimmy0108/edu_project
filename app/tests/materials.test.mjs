import assert from 'node:assert/strict';
import test from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import { zipSync, strToU8 } from 'fflate';
import { parseMaterial, retrieve, validateMaterials } from '../lib/materials.ts';
import { demoScaffold, validScaffold } from '../lib/classroom.ts';
import { buildFallbackLesson, confirmEntireLesson, decideLiveSupport, drainOrderedSegments, lessonReady, migrateLessonPackage, PHISHING_SAMPLE_MATERIALS, updateMastery, validateLessonPackage } from '../lib/lesson.ts';

globalThis.DOMParser = DOMParser;
test('PPTX follows presentation order after slides have been rearranged', async () => {
  const file = new File([zipSync({
    'ppt/presentation.xml': strToU8('<p:presentation xmlns:p="presentation" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId r:id="second"/><p:sldId r:id="first"/></p:sldIdLst></p:presentation>'),
    'ppt/_rels/presentation.xml.rels': strToU8('<Relationships xmlns="relationships"><Relationship Id="first" Target="slides/slide1.xml"/><Relationship Id="second" Target="slides/slide2.xml"/></Relationships>'),
    'ppt/slides/slide1.xml': strToU8(slide('現在排第二')),
    'ppt/slides/slide2.xml': strToU8(slide('現在排第一')),
  })], 'reordered.pptx');
  const chunks = await parseMaterial(file);
  assert.equal(chunks[0].text, '現在排第一'); assert.equal(chunks[0].location, '投影片 1');
});
const p = text => `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`;
const slide = text => `<p:sld xmlns:p="presentation" xmlns:a="drawing">${p(text)}</p:sld>`;

test('PPTX extracts numeric slide order, entity text, and excludes notes', async () => {
  const file = new File([zipSync({
    'ppt/slides/slide10.xml': strToU8(slide('第三段')),
    'ppt/slides/slide2.xml': strToU8(slide('RAG &amp; 教材檢索')),
    'ppt/notesSlides/notesSlide1.xml': strToU8(slide('不可混入的備註')),
  })], 'report.pptx');
  const chunks = await parseMaterial(file);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].location, '投影片 2');
  assert.equal(chunks[0].text, 'RAG & 教材檢索');
  assert.equal(chunks[0].confirmed, false);
});
test('DOCX preserves paragraph references, including table text', async () => {
  const file = new File([zipSync({ 'word/document.xml': strToU8('<w:document xmlns:w="word"><w:body><w:p><w:r><w:t>教案目標</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>支持閱讀</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>') })], 'plan.docx');
  const chunks = await parseMaterial(file);
  assert.equal(chunks.length, 2); assert.equal(chunks[1].location, '段落 2'); assert.equal(chunks[1].text, '支持閱讀');
});
test('rejects unsupported, empty and oversized documents', async () => {
  await assert.rejects(parseMaterial(new File(['x'], 'old.ppt')), /PPTX/);
  await assert.rejects(parseMaterial(new File([' '], 'empty.txt')), /找不到/);
  await assert.rejects(parseMaterial(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pptx')), /10 MB/);
});
test('retrieves confirmed relevant text only and handles unrelated query', () => {
  const materials = [
    { id: 'asr', file: 'report', location: '1', text: 'ASR 將教師聲音轉成即時字幕。', confirmed: true },
    { id: 'rag', file: 'report', location: '2', text: 'RAG 從教材檢索相關段落，提供模型依據。', confirmed: true },
    { id: 'draft', file: 'report', location: '3', text: 'RAG 教材檢索', confirmed: false },
  ];
  assert.equal(retrieve('RAG 如何從教材檢索？', materials)[0].id, 'rag');
  assert.ok(!retrieve('RAG 教材檢索', materials).some(c => c.id === 'draft'));
  assert.deepEqual(retrieve('photosynthesis', materials), []);
  assert.equal(validateMaterials([...materials, materials[0]]), false);
});
test('generic fallback uses only source text and rejects malformed scaffold', () => {
  const text = '植物利用陽光。RAG 檢索教材。'; const result = demoScaffold(text);
  assert.equal(validScaffold(result), true);
  assert.ok(result.keywords.every(w => text.includes(w)));
  assert.equal(validScaffold({ ...result, focus: { goal: 'x', steps: [42] } }), false);
  assert.equal(validScaffold(null), false);
});

test('builds a validated graph with official provenance and rejects prerequisite cycles', () => {
  const materials = PHISHING_SAMPLE_MATERIALS.map(item => ({ ...item, confirmed: true }));
  const lesson = buildFallbackLesson({ title: '釣魚郵件辨識', grade: '八年級', objective: '辨認並查證可疑郵件', materials });
  assert.equal(validateLessonPackage(lesson), true);
  assert.ok(lesson.nodes.some(node => node.sourceIds.some(id => id.startsWith('official-'))));
  const confirmed = confirmEntireLesson(lesson);
  assert.equal(lessonReady(confirmed), true);
  const cycle = structuredClone(confirmed);
  cycle.edges.push({ from: cycle.nodes[2].id, to: cycle.nodes[0].id, type: 'prerequisite', reason: '錯誤循環', sourceIds: [cycle.materials[0].id], teacherConfirmed: true });
  assert.equal(validateLessonPackage(cycle), false);
  const badSlide = structuredClone(confirmed);
  badSlide.slides[0].sourceIds = ['invented'];
  assert.equal(validateLessonPackage(badSlide), false);
});

test('migrates a confirmed v2 lesson without inventing mastery history', () => {
  const v3 = confirmEntireLesson(buildFallbackLesson({ title: '舊課程', grade: '八年級', objective: '理解概念', materials: PHISHING_SAMPLE_MATERIALS.map(item => ({ ...item, confirmed: true })) }));
  const v2 = structuredClone(v3); v2.version = 2; delete v2.slides;
  for (const profile of v2.profiles) delete profile.support.reading;
  const migrated = migrateLessonPackage(v2);
  assert.equal(migrated.version, 3);
  assert.ok(migrated.slides.length > 0);
  assert.equal(migrated.profiles[0].support.reading.fontScale, 1);
});

test('requires a stable repeated concept and keeps mastery evidence reversible', () => {
  const lesson = confirmEntireLesson(buildFallbackLesson({ title: '釣魚郵件辨識', grade: '八年級', objective: '辨認可疑郵件', materials: PHISHING_SAMPLE_MATERIALS.map(item => ({ ...item, confirmed: true })) }));
  assert.equal(decideLiveSupport('今天天氣很好', lesson), null);
  const first = decideLiveSupport('請檢查寄件者網域與拼字', lesson);
  assert.equal(first.stable, false);
  const second = decideLiveSupport('再次確認寄件者網域', lesson, first.conceptId);
  assert.equal(second.stable, true);
  const wrong = updateMastery(undefined, first.conceptId, false, 'pretest', 'q1');
  assert.equal(wrong.state, 'needs-check');
  const corrected = updateMastery(wrong, first.conceptId, true, 'live-check', 'q1');
  assert.equal(corrected.state, 'developing');
  const ready = updateMastery(corrected, first.conceptId, true, 'pretest', 'q2');
  assert.equal(ready.state, 'ready');
  assert.equal(ready.events.length, 3);
  const teacherReady = updateMastery(wrong, first.conceptId, true, 'teacher');
  assert.equal(teacherReady.state, 'ready');
});

test('rejects blank editable teaching content before publication', () => {
  const lesson = confirmEntireLesson(buildFallbackLesson({ title: '內容核對', grade: '八年級', objective: '辨認可疑郵件', materials: PHISHING_SAMPLE_MATERIALS.map(item => ({ ...item, confirmed: true })) }));
  lesson.cards[0].baseText = '   ';
  assert.equal(validateLessonPackage(lesson), false);
  lesson.cards[0].baseText = '依教材核對後的說明。';
  lesson.questions[0].options[0] = '';
  assert.equal(validateLessonPackage(lesson), false);
});

test('holds asynchronous transcript results until sequence gaps are filled', () => {
  const buffer = new Map();
  buffer.set(1, { sequence: 1, text: '第二段' });
  const waiting = drainOrderedSegments(buffer, 0);
  assert.deepEqual(waiting.values, []); assert.equal(waiting.nextSequence, 0);
  buffer.set(0, { sequence: 0, text: '第一段' });
  buffer.set(2, null);
  const drained = drainOrderedSegments(buffer, waiting.nextSequence);
  assert.deepEqual(drained.values.map(item => item.sequence), [0, 1]);
  assert.equal(drained.nextSequence, 3);
});

test('creates a valid minimum graph even from one confirmed generic lesson chunk', () => {
  const lesson = buildFallbackLesson({ title: '單一教材', grade: '七年級', objective: '理解核心概念', materials: [{ id: 'only', file: 'lesson.txt', location: '段落 1', text: '地球繞著太陽運行，形成一年週期。', confirmed: true }] });
  assert.equal(lesson.nodes.length, 3);
  assert.equal(lesson.questions.length, 3);
  assert.ok(lesson.slides.length >= 1);
  assert.equal(validateLessonPackage(lesson), true);
});
