import pytest
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

    

