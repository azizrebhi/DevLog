import operator
from typing import Annotated, TypedDict
from langchain_openai import ChatOpenAI
from langchain_core.messages import AnyMessage, HumanMessage
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

# 1. Define the Global State Schema
class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]

# 2. Initialize the Model
model = ChatOpenAI(model="gpt-4o-mini")

# 3. Define the Nodes as plain Python functions (NO self!)
def call_llm(state: AgentState):
    """Takes the state, runs the model, returns the new message."""
    print("\n--- [NODE] Calling LLM ---")
    response = model.invoke(state["messages"])
    return {"messages": [response]}

# 4. Construct the Graph Topology
workflow = StateGraph(AgentState)

# Add our node to the canvas
workflow.add_node("llm_node", call_llm)

# Set the entry point and where to go next
workflow.set_entry_point("llm_node")
workflow.add_edge("llm_node", END) # For now, go straight to the end

# 5. Add a local In-Memory Checkpointer
memory = MemorySaver()

# 6. Compile the application
app = workflow.compile(checkpointer=memory)

# 7. Execute the Graph using a Thread ID (Session)
config = {"configurable": {"thread_id": "user_session_1"}}

initial_state = {"messages": [HumanMessage(content="Explain the concept of state in 5 words.")]}
final_state = app.invoke(initial_state, config=config)

print("\n--- Final Chat History in State ---")
for msg in final_state["messages"]:
    print(f"{msg.type.upper()}: {msg.content}")


