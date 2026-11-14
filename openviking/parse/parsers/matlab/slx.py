# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: AGPL-3.0
"""Read Simulink SLX system XML without requiring a MATLAB installation."""

from __future__ import annotations

import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from defusedxml import ElementTree as ET

from openviking.parse.parsers.matlab.catalog import find_block
from openviking.parse.parsers.matlab.templates import render_block_template


@dataclass
class Block:
    sid: str
    name: str
    block_type: str
    parameters: dict[str, str] = field(default_factory=dict)
    source_block: str = ""
    system_ref: str = ""


@dataclass
class Edge:
    source: str
    destination: str
    name: str = ""


@dataclass
class System:
    ref: str
    name: str
    blocks: list[Block] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)
    children: list["System"] = field(default_factory=list)
    parent: "System | None" = field(default=None, repr=False)

    @property
    def inputs(self) -> list[Block]:
        return _ports(self.blocks, "Inport")

    @property
    def outputs(self) -> list[Block]:
        return _ports(self.blocks, "Outport")


def _ports(blocks: Iterable[Block], kind: str) -> list[Block]:
    def number(block: Block) -> tuple[int, str]:
        try:
            return int(block.parameters.get("Port", "1")), block.name
        except ValueError:
            return 1, block.name

    return sorted((b for b in blocks if b.block_type == kind), key=number)


def parse_slx(path: str | Path) -> System:
    """Parse the complete subsystem hierarchy and connectivity from an SLX file."""
    path = Path(path)
    try:
        archive = zipfile.ZipFile(path)
    except zipfile.BadZipFile as exc:
        raise ValueError(f"Not a valid SLX archive: {path.name}") from exc

    with archive:
        root_xml = _archive_xml(archive, "simulink/blockdiagram.xml")
        model = root_xml.find("./Model")
        root_ref_element = model.find("./System") if model is not None else None
        root_ref = (
            root_ref_element.get("Ref", "system_root")
            if root_ref_element is not None
            else "system_root"
        )
        systems: dict[str, System] = {}
        pending: list[tuple[System, Block]] = []

        def read_system(ref: str, name: str, parent: System | None) -> System:
            member = f"simulink/systems/{ref}.xml"
            element = _archive_xml(archive, member)
            system = System(ref=ref, name=name, parent=parent)
            systems[ref] = system
            for node in element.findall("./Block"):
                sid = node.get("SID", "")
                block = Block(
                    sid=sid,
                    name=node.get("Name", sid or "Unnamed"),
                    block_type=node.get("BlockType", "Unknown"),
                )
                for prop in node.findall("./P"):
                    key = prop.get("Name")
                    if key:
                        block.parameters[key] = prop.text or ""
                instance = node.find("./InstanceData")
                if instance is not None:
                    for prop in instance.findall("./P"):
                        key = prop.get("Name")
                        if key:
                            block.parameters[key] = prop.text or ""
                block.source_block = block.parameters.get("SourceBlock", "")
                child_ref = node.find("./System")
                if child_ref is not None:
                    block.system_ref = child_ref.get("Ref", "")
                system.blocks.append(block)
                if block.system_ref:
                    pending.append((system, block))
            for line in element.findall("./Line"):
                _read_line(line, system.edges)
            return system

        root = read_system(root_ref, path.stem, None)
        for parent, block in pending:
            # A system can only be referenced once in the XML hierarchy. Preserve
            # unresolved references as blocks instead of silently dropping them.
            if block.system_ref in systems:
                continue
            child = read_system(block.system_ref, block.name, parent)
            parent.children.append(child)
        return root


def _archive_xml(archive: zipfile.ZipFile, name: str):
    try:
        return ET.fromstring(archive.read(name))
    except KeyError as exc:
        raise ValueError(f"SLX archive is missing {name}") from exc


def _read_line(
    line, edges: list[Edge], inherited_source: str = "", inherited_name: str = ""
) -> None:
    props = {p.get("Name"): p.text or "" for p in line.findall("./P")}
    source = props.get("Src", inherited_source)
    name = props.get("Name", inherited_name)
    destination = props.get("Dst", "")
    if source and destination:
        edges.append(Edge(source=source, destination=destination, name=name))
    for branch in line.findall("./Branch"):
        _read_line(branch, edges, source, name)


_UI_PARAMETERS = {
    "Position",
    "ZOrder",
    "ShowName",
    "HideAutomaticName",
    "FontSize",
    "FontName",
    "FontWeight",
    "FontAngle",
    "ForegroundColor",
    "BackgroundColor",
    "DropShadow",
    "NameLocation",
    "NamePlacement",
    "IconDisplay",
    "PortRotation",
    "BlockRotation",
    "BlockMirror",
    "LibraryVersion",
    "RTWMemSecFuncInitTerm",
    "RTWMemSecFuncExecute",
    "RTWMemSecDataParameters",
    "RTWMemSecDataConstants",
    "RTWMemSecDataInternal",
    "ContentPreviewEnabled",
    "RefBlkName",
    "VectorParamsAs1DForOutWhenUnconnected",
}
_SIMPLE_BLOCKS = {
    "Add",
    "Sum",
    "Or",
    "And",
    "Logic",
    "RelationalOperator",
    "Product",
    "Gain",
    "BusCreator",
    "BusSelector",
    "Mux",
    "Demux",
    "Terminator",
    "Ground",
}


def _display_parameters(block: Block) -> dict[str, str]:
    return {
        k: v
        for k, v in block.parameters.items()
        if k not in _UI_PARAMETERS and not k.startswith("SID")
    }


def _cell(value: str) -> str:
    return (value or " ").replace("|", "\\|").replace("\r", "").replace("\n", "<br>")


def _slug(value: str) -> str:
    value = re.sub(r"[^\w.-]+", "_", value, flags=re.UNICODE).strip("._")
    return value or "subsystem"


def _mermaid_text(value: str) -> str:
    return value.replace('"', "'").replace("\n", " ").replace("\r", "")


def _system_path(system: System) -> str:
    names: list[str] = []
    current = system.parent
    while current is not None:
        names.append(_slug(current.name))
        current = current.parent
    return "/".join(reversed(names))


def _child_directory(system: System) -> str:
    siblings = system.parent.children if system.parent else []
    duplicates = sum(_slug(s.name) == _slug(system.name) for s in siblings)
    suffix = f"_{system.ref.removeprefix('system_')}" if duplicates > 1 else ""
    return _slug(system.name) + suffix


def system_documents(model: System) -> dict[str, str]:
    """Return nested ``subsystem/index.md`` documents for a parsed model."""
    documents: dict[str, str] = {}

    def visit(system: System, directory: str, is_root: bool = False) -> None:
        path = "index.md" if is_root else f"{directory}/index.md"
        documents[path] = _render_system(system, directory, is_root)
        for child in system.children:
            child_dir = (
                f"{directory}/{_child_directory(child)}" if directory else _child_directory(child)
            )
            visit(child, child_dir)

    visit(model, "", True)
    return documents


def _render_system(system: System, directory: str, is_root: bool) -> str:
    blocks = {b.sid: b for b in system.blocks}
    lines = [
        "---",
        "type: simulink-subsystem",
        f"system_ref: {system.ref}",
        "---",
        "",
        f"# {system.name}",
        "",
        f"源文件系统 ID：`{system.ref}`。本页由 SLX XML 确定性生成，不执行模型，也不推断未在文件中出现的动态语义。",
        "",
        "## 输入",
        "",
        "| 端口 | 信号 | 源块 SID |",
        "| --- | --- | --- |",
    ]
    for port in system.inputs:
        lines.append(f"| {port.parameters.get('Port', '1')} | {_cell(port.name)} | {port.sid} |")
    if not system.inputs:
        lines.append("| - | 无显式 Inport | - |")
    lines.extend(["", "## 输出", "", "| 端口 | 信号 | 目标块 SID |", "| --- | --- | --- |"])
    for port in system.outputs:
        lines.append(f"| {port.parameters.get('Port', '1')} | {_cell(port.name)} | {port.sid} |")
    if not system.outputs:
        lines.append("| - | 无显式 Outport | - |")

    lines.extend(["", "## 子系统", ""])
    if is_root:
        lines.append("- [解析覆盖清单](coverage.md)：Stateflow、外部库和二进制工作区边界")
    if system.children:
        for child in system.children:
            lines.append(f"- [{child.name}]({_child_directory(child)}/index.md) (`{child.ref}`)")
    else:
        lines.append("无嵌套子系统。")

    lines.extend(
        [
            "",
            "## 可配置块",
            "",
            "仅列出带业务参数的块及引用块；Add、And、Or 等简单运算的连接关系保留在流程图中。",
            "",
            "| 块 | 类型 / 库来源 | SID | 参数 |",
            "| --- | --- | --- | --- |",
        ]
    )
    rows = 0
    block_templates: dict[str, str] = {}
    for block in system.blocks:
        if block.block_type in {"Inport", "Outport"}:
            continue
        params = _display_parameters(block)
        if block.block_type == "SubSystem" and not params:
            continue
        if block.block_type in _SIMPLE_BLOCKS and not params:
            continue
        if not params and not block.source_block and block.block_type in _SIMPLE_BLOCKS:
            continue
        if not params and not block.source_block:
            continue
        param_text = "<br>".join(f"`{_cell(k)}` = `{_cell(v)}`" for k, v in sorted(params.items()))
        source = block.block_type + (
            f" / `{_cell(block.source_block)}`" if block.source_block else ""
        )
        catalog_match = find_block(block.block_type, block.source_block)
        if catalog_match:
            family, canonical = catalog_match
            source += f" / 目录：`{family}/{_cell(canonical)}`"
            rendered_template = render_block_template(block.block_type, block.source_block)
            if rendered_template:
                canonical_name, template_markdown = rendered_template
                block_templates.setdefault(canonical_name, template_markdown)
        lines.append(f"| {_cell(block.name)} | {source} | {block.sid} | {param_text or '-'} |")
        rows += 1
    if not rows:
        lines.append("| - | - | - | 无 |")

    if block_templates:
        lines.extend(
            [
                "",
                "## 块知识模板",
                "",
                "以下内容在资源添加时由原始 `BlockType` / `SourceBlock` 匹配本地 R2025b 模板并内联。"
                "同名块只展开一次，各实例自己的配置仍以上表为准。",
            ]
        )
        for canonical_name, template_markdown in block_templates.items():
            lines.extend(["", f"### {canonical_name}", "", template_markdown, ""])

    lines.extend(["", "## 信号逻辑流程图", "", "```mermaid", "flowchart LR"])
    for block in system.blocks:
        node = f"b{_slug(block.sid)}"
        shape_left, shape_right = (
            ("([", "])") if block.block_type in {"Inport", "Outport"} else ("[", "]")
        )
        label = f"{block.name}\\n{block.block_type}"
        lines.append(f'  {node}{shape_left}"{_mermaid_text(label)}"{shape_right}')
    for edge in system.edges:
        source_sid, source_port = _endpoint(edge.source)
        destination_sid, destination_port = _endpoint(edge.destination)
        if source_sid not in blocks or destination_sid not in blocks:
            continue
        label = edge.name or f"out:{source_port} → in:{destination_port}"
        lines.append(
            f"  b{_slug(source_sid)} -->|{_mermaid_text(label)}| b{_slug(destination_sid)}"
        )
    lines.extend(["```", "", "## 连接表", "", "| 信号 | 来源 | 去向 |", "| --- | --- | --- |"])
    if system.edges:
        for edge in system.edges:
            source_sid, source_port = _endpoint(edge.source)
            destination_sid, destination_port = _endpoint(edge.destination)
            source = blocks.get(source_sid)
            destination = blocks.get(destination_sid)
            lines.append(
                f"| {_cell(edge.name) or '-'} | {_cell(source.name if source else source_sid)} (out:{source_port}) "
                f"| {_cell(destination.name if destination else destination_sid)} (in:{destination_port}) |"
            )
    else:
        lines.append("| - | 无显式连线 | - |")
    lines.append("")
    return "\n".join(lines)


def _endpoint(value: str) -> tuple[str, str]:
    match = re.fullmatch(r"(.*)#(?:in|out):(.+)", value)
    return (match.group(1), match.group(2)) if match else (value, "?")
