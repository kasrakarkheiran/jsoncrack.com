import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Group, Textarea } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useFile from "../../../store/useFile";
import useJson from "../../../store/useJson";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const setSelectedNode = useGraph(state => state.setSelectedNode);
  const setContents = useFile(state => state.setContents);
  const getContents = useFile(state => state.getContents);
  const setJson = useJson(state => state.setJson);

  const [editing, setEditing] = React.useState(false);
  const [editedText, setEditedText] = React.useState("");

  React.useEffect(() => {
    // reset editing state when modal opens/closes or node changes
    setEditing(false);
    setEditedText("");
  }, [opened, nodeData]);

  const setAtPath = (obj: any, path: NodeData["path"] | undefined, value: any) => {
    if (!path || path.length === 0) return value;
    const out = Array.isArray(obj) ? obj.slice() : { ...obj };
    let cur: any = out;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i] as string | number;
      const nextSeg = path[i + 1];
      if (typeof seg === "number") {
        cur[seg] = cur[seg] ?? (typeof nextSeg === "number" ? [] : {});
      } else {
        cur[seg] = cur[seg] ?? (typeof nextSeg === "number" ? [] : {});
      }
      cur = cur[seg as any];
    }
    const last = path[path.length - 1] as string | number;
    cur[last as any] = value;
    return out;
  };

  const getAtPath = (obj: any, path: NodeData["path"] | undefined) => {
    if (!path || path.length === 0) return obj;
    let cur = obj;
    for (let i = 0; i < path.length; i++) {
      const seg = path[i] as string | number;
      if (cur == null) return undefined;
      cur = cur[seg as any];
    }
    return cur;
  };

  const handleEdit = () => {
    setEditedText(normalizeNodeData(nodeData?.text ?? []));
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditedText("");
  };

  const handleSave = async () => {
    if (!nodeData) return;

    // Determine new value from edited text. Try JSON.parse, fall back to raw string
    let newValue: any;
    try {
      newValue = JSON.parse(editedText);
    } catch (e) {
      // not valid JSON — treat as string
      newValue = editedText;
    }

    try {
      const current = getContents();
      const parsed = JSON.parse(current);

      // preserve details and nutrients if they exist on the current node
      const existingValue = getAtPath(parsed, nodeData.path);

      if (existingValue && typeof existingValue === "object" && existingValue !== null && typeof newValue === "object" && newValue !== null) {
        if (existingValue.details && newValue.details === undefined) newValue.details = existingValue.details;
        if (existingValue.nutrients && newValue.nutrients === undefined) newValue.nutrients = existingValue.nutrients;
      }

      const updated = setAtPath(parsed, nodeData.path, newValue);
      const newStr = JSON.stringify(updated, null, 2);

      // update editor contents and update graph immediately
      await setContents({ contents: newStr, hasChanges: true });
      setJson(newStr);

      // refresh selected node from updated graph so modal shows new data
      const nodes = useGraph.getState().nodes;
      const findPath = (p?: NodeData["path"]) => (p ? JSON.stringify(p) : "");
      const target = nodes.find(n => findPath(n.path) === findPath(nodeData.path));
      if (target && setSelectedNode) setSelectedNode(target);

      // close edit mode
      setEditing(false);
      setEditedText("");
    } catch (error) {
      // if anything fails, just exit edit mode and keep original
      console.error("Failed to save node edit", error);
    }
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Group spacing="xs">
              {!editing ? (
                <Button size="xs" variant="outline" onClick={handleEdit}>
                  Edit
                </Button>
              ) : (
                <>
                  <Button size="xs" variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button size="xs" onClick={handleSave}>
                    Save
                  </Button>
                </>
              )}
              <CloseButton onClick={onClose} />
            </Group>
          </Flex>

          <ScrollArea.Autosize mah={250} maw={600}>
            {!editing ? (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            ) : (
              <Textarea
                minRows={6}
                value={editedText}
                onChange={e => setEditedText(e.currentTarget.value)}
                styles={{ input: { fontFamily: "monospace", fontSize: 13 } }}
              />
            )}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
