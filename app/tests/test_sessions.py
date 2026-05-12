import pytest
import uuid
async def test_session_create(auth_client):
    data={"project":"str",
    "worked_on" : "str "  ,
    "duration" : "5",
    "what_learned" : "str",
    "blockers" : "str",
    "status": "active"}
    response=await auth_client.post("/sessions/",json=data)
    assert response.status_code==200 
    assert "id" in response.json()
async def test_create_session_unauthorized(client):
    data={"project":"str",
    "worked_on" : "str "  ,
    "duration" : "5",
    "what_learned" : "str",
    "blockers" : "str",
    "status": "active"}
    response=await client.post("/sessions/",json=data)
    assert response.status_code==401
async def test_get_sessions(auth_client):
     data={"project":"str",
    "worked_on" : "str "  ,
    "duration" : "5",
    "what_learned" : "str",
    "blockers" : "str",
    "status": "active"}
     await auth_client.post("/sessions/",json=data)
     data={"project":"str1",
    "worked_on" : "str1 "  ,
    "duration" : "5",
    "what_learned" : "str1",
    "blockers" : "str1",
    "status": "active"}
     await auth_client.post("/sessions/",json=data)
     response = await auth_client.get("/sessions/")
     assert response.status_code==200
     page_data = response.json()
     assert isinstance(page_data, dict)  
    
    
     assert "items" in page_data
     assert "next_cursor" in page_data
     assert "has_more" in page_data
     assert isinstance(page_data["has_more"], bool)
       
     sessions_list = page_data["items"]
     assert isinstance(sessions_list, list)
     assert len(sessions_list) == 2
    
     projects = [session["project"] for session in sessions_list]
     assert "str" in projects
     assert "str1" in projects
async def test_get_single_session(auth_client):
    data={"project":"str",
    "worked_on" : "str"  ,
    "duration" : "5",
    "what_learned" : "str",
    "blockers" : "str",
    "status": "active"}
    response =await auth_client.post("/sessions/",json=data)
    id =response.json()["id"]
    response1= await auth_client.get(f"/sessions/{id}")
    assert response1.status_code==200
    session = response.json()
    assert isinstance(session, dict)
    assert session["project"]=="str"
    assert session["worked_on"]=="str"

async def test_get_nonexistent_session(auth_client):
    fake_id = str(uuid.uuid4())
    response= await auth_client.get(f"/sessions/{fake_id}")
    assert response.status_code==404
async def test_delete_session(auth_client):
    data={"project":"str",
    "worked_on" : "str"  ,
    "duration" : "5",
    "what_learned" : "str",
    "blockers" : "str",
    "status": "active"}
    response =await auth_client.post("/sessions/",json=data)
    id =response.json()["id"]
    response1= await auth_client.delete(f"/sessions/{id}")
    assert response1.status_code==204
async def test_update_session_put(auth_client):
    data={"project":"str",
    "worked_on" : "str"  ,
    "duration" : "5",
    "what_learned" : "str",
    "blockers" : "str",
    "status": "active"}
    response =await auth_client.post("/sessions/",json=data)
    id =response.json()["id"]
    data1={"project":"testput",
    "worked_on" : "testput"  ,
    "duration" : "5",
    "what_learned" : "testput",
    "blockers" : "testput",
    "status": "active"}
    response1= await auth_client.put(f"/sessions/{id}",json=data1)
    assert response1.status_code==200
    session=response1.json()
    assert isinstance(session,dict)
    assert session["project"]=="testput"

async def test_update_session_patch(auth_client):
    data={"project":"str",
    "worked_on" : "str"  ,
    "duration" : "5",
    "what_learned" : "str",
    "blockers" : "str",
    "status": "active"}
    response =await auth_client.post("/sessions/",json=data)
    id =response.json()["id"]
    data1={"project":"testpatch",
    "worked_on" : "testpatch"
    }
    response1= await auth_client.patch(f"/sessions/{id}",json=data1)
    assert response1.status_code==200
    session=response1.json()
    assert isinstance(session,dict)
    assert session["project"]=="testpatch"

async def test_filter_sessions_by_project(auth_client):
    data={"project":"str",
    "worked_on" : "str "  ,
    "duration" : "5",
    "what_learned" : "str",
    "blockers" : "str",
    "status": "active"}
    await auth_client.post("/sessions/",json=data)
    data={"project":"str1",
    "worked_on" : "str1 "  ,
    "duration" : "5",
    "what_learned" : "str1",
    "blockers" : "str1",
    "status": "active"}
    await auth_client.post("/sessions/",json=data)
    response=await auth_client.get("/sessions/?project=str1")
    assert response.status_code==200
    SessionPage=response.json()["items"]
    assert len(SessionPage)==1
    assert SessionPage[0]["project"]=="str1"
async def test_get_draft_sessions(auth_client):
    data={"project":"str",
    "worked_on" : "str "  ,
    "duration" : "5",
    "what_learned" : "str",
    "blockers" : "str",
    "status": "ACTIVE"}
    await auth_client.post("/sessions/",json=data)
    data1={"project":"strdraft",
    "worked_on" : "str "  ,
    "duration" : "5",
    "what_learned" : "str",
    "blockers" : "str",
    "status": "DRAFT"}
    await auth_client.post("/sessions/",json=data1)
    response= await auth_client.get("/sessions/drafts")
    assert response.status_code==200
    list1=response.json()
    assert isinstance(list1,list)
    assert len(list1)==1
    assert list1[0]["project"]=="strdraft"
