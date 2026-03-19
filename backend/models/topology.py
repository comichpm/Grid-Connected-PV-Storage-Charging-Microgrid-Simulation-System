"""Microgrid topology model."""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class EdgeModel(BaseModel):
    id: str
    source: str
    target: str


class TopologyModel(BaseModel):
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[EdgeModel] = Field(default_factory=list)


class TopologySave(BaseModel):
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)
