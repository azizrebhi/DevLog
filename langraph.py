import os
import operator
from typing import Annotated, TypedDict
import psycopg
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langchain_core.messages import AnyMessage, HumanMessage, ToolMessage
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres import PostgresSaver
from langchain_community.tools.tavily_search import TavilySearchResults

# 1. Define the Global State Schema
class PipelineState(TypedDict):
    messages : Annotated[AnyMessage,operator.add]
    draft_article:str
    fact_check_logs:Annotated[str,operator.add]
    review_passed:bool


# =====================================================================
# 2. TOOLS & MODEL INITIALIZATION
# =====================================================================
web_search_tool=TavilySearchResults(max_results=4)
tools_registry = {
    "Travily_search": web_search_tool,
}

# 3. Initialize Model and Bind the Tool
# This passes the schema of calculate_pfe_score to OpenAI
model = ChatOpenAI(model="gpt-4o-mini").bind_tools([web_search_tool])



def writer_node(state: PipelineState):
    """Generates or rewrites the press release based on instructions or critique."""
    print("\n✍️  --- [NODE]: Writer is drafting article... ---")
    
    # Check if the checker has previously left feedback
    critique = state.get("fact_check_logs", "")
    base_prompt = state["messages"][0].content
    
    system_instruction = "You are a professional corporate PR writer. Output ONLY raw markdown formatting."
    if critique:
        system_instruction += f"\nCRITICAL FIX REQUIRED FROM EDITOR: {critique}"
        
    messages = [
        HumanMessage(content=system_instruction),
        HumanMessage(content=f"Draft a release for: {base_prompt}")
    ]
    
    # We use a clean model call for drafting to isolate the text generation from tool execution
    draft = ChatOpenAI(model="gpt-4o-mini").invoke(messages).content
    return {"draft_article": draft}

def researcher_node(state: PipelineState):
    """Analyzes the draft, triggers corporate web tool executions to verify facts."""
    tools_output=[]
    draft = state.get("draft_article", "")
    system_prompt=f"analyze this draft and call the tools necessary to verify its technical claim {draft}"
    response=model.invole([HumanMessage(content=system_prompt)])
    for tool in response.tool_calls : 
        func=tools_registry[tool['name']]
        args=tool['arguments']
        result=func(**args)
        tool_output=ToolMessage(
            content:str(result),
            toll_call_id:tool['id'],
            name:tool['name']
        )
        tools_output.append(tool_output)
    return {"messages":tools_output}

def checker_node(state: PipelineState):
    """LLM-as-a-Judge node. Audits the article against gathered tool facts."""
    print("\n⚖️  --- [NODE]: Checker is auditing content credibility... ---")
    last_message=state['messages'][-1]
    

    # TODO: Fetch all historical ToolMessages out of state["messages"] to create a facts context string.
    # Pass the facts context and the 'draft_article' to an LLM with a strict rubric prompt.
    # Extract if it passed or failed, then return the text critique and the pass/fail boolean flag.
    


        

    
    return {"draft_article": "Your drafted text goes here"}


# 4. Define Nodes
def call_llm(state: AgentState):
    """Node to execute the LLM."""
    print("\n--- [NODE] Calling LLM ---")
    response = model.invoke(state["messages"])
    return {"messages": [response]}

def execute_tools(state:AgentState):
    tool_outputs=[]
    last_message=state["messages"][-1]
    for tool in last_message.tool_calls : 
        tool_name=tool["name"]
        tool_args=tool["args"]
        func=tools_registry[tool_name]
        result=func(**tool_args)
        tool_message=ToolMessage(
            type="tool",
            content=str(result),
            tool_call_id=tool["id"]
        )
        tool_outputs.append(tool_message)
    return {"messages":tool_outputs}
def route_next_step(state:AgentState):
    last_message=state["messages"][-1]
    tool_call=getattr(last_message,tool_calls,None)
    if tool_call : 
        return "action_node"
    return "__end__"


# 6. Build the Graph
graph=StateGraph(AgentState)

graph.add_node("llm",call_llm)
graph.add_node("action_node",execute_tools)
graph.add_conditional_edges(
    "llm",
    route_next_step,
    {"action_node":"action_node","__end__":END}

)
graph.add_edge("action_node","LLM")
memory = MemorySaver()
app = graph.compile(checkpointer=memory)
