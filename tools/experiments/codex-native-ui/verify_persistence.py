"""Audit real app-server traces from before and after a process restart."""
import argparse
import json
from pathlib import Path


def read(path):
    return [json.loads(line) for line in path.read_text().splitlines()]


def exchanges(rows, method):
    responses = {row['message']['id']: row['message'] for row in rows
                 if row['direction'] == 'from-server' and 'id' in row['message']}
    return [(row['message'], responses.get(row['message']['id'], {})) for row in rows
            if row['direction'] == 'to-server' and row['message'].get('method') == method]


def completed_text(rows, thread):
    texts, completed = [], 0
    for row in rows:
        msg = row['message']
        if row['direction'] != 'from-server' or msg.get('params', {}).get('threadId') != thread:
            continue
        if msg.get('method') == 'item/completed':
            item = msg['params']['item']
            if item['type'] == 'agentMessage':
                texts.append(item['text'])
        if msg.get('method') == 'turn/completed':
            assert msg['params']['turn']['status'] == 'completed'
            completed += 1
    return texts, completed


def verify(before, after, thread):
    starts = [(request, response) for request, response in exchanges(before, 'thread/start')
              if response.get('result', {}).get('thread', {}).get('id') == thread]
    assert len(starts) == 1 and starts[0][0]['params']['ephemeral'] is False
    assert starts[0][1]['result']['thread']['path']
    assert not any(response.get('result', {}).get('thread', {}).get('id') == thread
                   for _, response in exchanges(after, 'thread/start'))
    assert any(request['params']['threadId'] == thread and 'result' in response
               for request, response in exchanges(before, 'thread/name/set'))
    for rows in (before, after):
        assert any(any(entry['id'] == thread for entry in response.get('result', {}).get('data', []))
                   for _, response in exchanges(rows, 'thread/list'))
        resumes = [response['result'] for request, response in exchanges(rows, 'thread/resume')
                   if request['params']['threadId'] == thread and 'result' in response]
        assert resumes
        assert any('SAVED_LANTERN_7429' in json.dumps(result['initialTurnsPage']) for result in resumes)
    texts_before, count_before = completed_text(before, thread)
    texts_after, count_after = completed_text(after, thread)
    assert 'SAVED_LANTERN_7429' in texts_before and count_before >= 1
    assert 'LANTERN-7429' in texts_after and count_after >= 1
    turns = [request for request, response in exchanges(after, 'turn/start')
             if request['params']['threadId'] == thread and 'result' in response]
    assert turns and all('LANTERN-7429' not in json.dumps(request['params']['input']) for request in turns)
    assert all(request['params']['sandboxPolicy']['type'] == 'readOnly' for request in turns)
    return {'threadId': thread, 'persistentStart': True, 'titlePersisted': True,
            'listedAfterRefreshAndRestart': True, 'historyRestoredViaResume': True,
            'continuedSameThreadAfterRestart': True, 'markerRecalledWithoutRepeatingIt': True,
            'turnsCompletedBeforeRestart': count_before, 'turnsCompletedAfterRestart': count_after,
            'cloudHistoryConnected': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('before', type=Path)
    parser.add_argument('after', type=Path)
    parser.add_argument('thread')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = verify(read(args.before), read(args.after), args.thread)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
