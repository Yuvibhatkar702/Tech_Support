# Grievance-Portal

**Make sure you have following versions of the setup installed**.
- Node JS 22.21.1 LTS
- Python 3.10.11 

## Dataset Links and Directory Structure

- Road & Garbage Dataset: https://data.mendeley.com/datasets/zndzygc3p3/2
- Street Light Dataset (Electricity Issues): https://github.com/Team16Project/Street-Light-Dataset

Or you can use the following dataset made by me: https://www.kaggle.com/datasets/shloksonkusare2/municipal-social-issues-dataset/data

#### Directory Structure
- Arrange the dataset properly in the following structure
```
ai_model/
    dataset/
        train/
            DamagedRoads/               image1.jpg  image2.jpg ...
            ElectricityIssues/          ...
            GarbageAndSanitation/       ...
        val/
            DamagedRoads/               image1.jpg  image2.jpg ...
            ElectricityIssues/          ...
            GarbageAndSanitation/       ...
```
- To add the classes, simply add the folder as a new class in the dataset folder and add images in it.


## How to Run the Project (all modules concurrently)

**Make sure the .env file present in the server folder has all the necessary connection string mentioned before running the following commands**

Open the Powershell terminal in the root directory and type the follwoing command:
```
npm run dev
```
The project will be running live locally on `5173` port.

## How to Run the Project (Starting each module seperately)

#### 1. How to start the AIML Backend
1. Create the virtual environment and activate it in the ```ai_model``` folder using the following commands (in Windows)
```
cd ai_model
python -m venv venv
venv\Scripts\activate
```
2. Install the required packages mentioned in requirements.txt
```
pip install -r requirements.txt
```
3. Train the model using the following command:
```
python train_model.py
```
4. Run the following command to launch the server
```
uvicorn main:app  --reload
```
5. The Project is live on the ```8000``` port of the localhost

#### 2. How to start the frontend
1. Enter the following commands to install the packages:
```
cd client
npm install
```
2. Build the project using the following command:
```
npm run build
```
3. Launch the project using the following command:
```
npm run dev
```
4. The project is live on the ```5173``` port of the localhost

#### 3. How to start the backend
1. Enter the following commands to install the packages:
```
cd server
npm install
```
2. Launch the project
```
npm run dev
```

## - Note
- The connection string of the MongoDB cluster should be connected in the `.env` file of the project present in the `server` folder.
- Run the following command in the server folder to create the .env file.
```
cp .env.example .env
```
- Example of connection string 
```
MONGO_URI=mongodb+srv://ComplaintAdmin:ComplaintAdmin123@firstcluster.i53fjue.mongodb.net/ComplaintRegistration?retryWrites=true&w=majority
```